# Imperium das Chaves

Sistema de gestão de performance de loja. React + Vite. Deploy alvo: Vercel.
Banco de dados: Firebase (Firestore + Auth). **Não usa mais Cloud Functions
nem nenhuma API de IA** — ver "Por que não tem mais IA" abaixo.

## Rodando localmente

```bash
npm install
npm run dev
```

**Sem `.env` preenchido**, o app roda 100% no modo mock: senha hardcoded
(`src/config/auth.js`, `ACCESS_PASSWORD`), dados fictícios no gráfico, e as
abas Vendas/Funcionários/Clientes/Gastos mostram um aviso pedindo para
configurar o Firebase. Nada quebra, é só um modo degradado para
desenvolvimento sem depender de credenciais reais.

**Com `.env` preenchido** (ver seção "Configurar o Firebase" abaixo), tudo
passa a ser real: login via Firebase Auth, e filiais/funcionários/clientes/
gastos/vendas gravados no Firestore — incluindo a importação de PDF, que
roda inteiramente no navegador, sem backend nenhum.

## Por que não tem mais IA

Até a versão anterior, importar um relatório do CDS passava por uma Cloud
Function que mandava o PDF pro Gemini extrair os valores. Isso foi
**removido de propósito**: os relatórios que a loja usa (Caixa Detalhado,
Histórico das Despesas, Vendas por Mês) são gerados por um template fixo do
CDS — sempre a mesma estrutura, os mesmos rótulos, os mesmos totais já
impressos. Pra esse tipo de entrada, um parser de texto determinístico é
estritamente melhor que IA: não erra soma, não "reformata" um nome por
conta própria, roda de graça e na hora (sem chamada de API nem custo), e
ainda consegue se autovalidar (ver `consistente` mais abaixo).

Regra geral que ficou daqui pra frente: **dado que nasce estruturado (export
de um sistema) → parser determinístico. Dado que nasce não-estruturado
(foto, papel, formato de terceiro que a gente não controla) → aí sim
valeria considerar IA de novo** — e mesmo assim como decisão pontual quando
esse caso realmente aparecer, não como algo que já existe hoje.

## Como funciona a importação de PDF agora

Tudo em `src/parsers/` + `src/hooks/usePdfImport.js`, sem nenhum servidor
envolvido:

1. `src/parsers/pdfToText.js` usa `pdfjs-dist` pra extrair o texto do PDF
   *no navegador*, reagrupando os fragmentos de texto em linhas (por
   coordenada Y, com tolerância) — os relatórios do CDS não têm estrutura
   de tabela real dentro do PDF, é tudo texto solto posicionado livremente.
2. Cada relatório tem seu parser dedicado, todo em regex/string puro:
   - `parseCaixaDiario` (`caixaDiario.js`) — "Caixa Detalhado" (um dia ou um
     período — o mesmo relatório serve pros dois casos, já que cada linha
     já traz sua própria data). Soma os totais por forma de pagamento
     **já impressos pelo próprio CDS** (não recalculados por nós) e confere
     contra o "Subtotal Vendas" do rodapé — se não bater (tolerância de 2
     centavos por arredondamento de parcela), marca `consistente: false` e
     o usuário revisa antes de confirmar. Também extrai os nomes de cliente
     únicos (exceto "CONSUMIDOR") pra cadastro automático em Clientes.
   - `parseVendasPorMes` (mesmo arquivo) — "Vendas por Mês", usado tanto
     pro histórico geral da filial quanto (com um funcionário escolhido
     antes do upload) pras vendas mensais por funcionário — ver abaixo.
   - `parseDespesasCaixa` (`despesasCaixa.js`) — "Histórico das Despesas".
     Categoriza cada lançamento por palavra-chave conhecida, **ignora
     `SANGRIA` como gasto** (é dinheiro indo pro banco, não prejuízo — mas
     ainda aparece na tela só pra conferência), e casa o funcionário do
     lançamento comparando com os nomes já cadastrados na filial (tolera
     acento e maiúscula/minúscula diferentes).
3. O resultado do parser vira um preview editável em React (nada é gravado
   ainda) — o usuário confere linha a linha e só então clica em "Confirmar
   e lançar", que grava direto no Firestore.

**Sobre "Vendas por funcionário"**: o próprio CDS, ao filtrar um relatório
por vendedor, apaga o nome do vendedor do PDF gerado (só sobra o total —
isso é uma limitação do CDS, não nossa). Por isso a aba Funcionários pede
pra escolher o funcionário *antes* de anexar o arquivo, em vez de tentar
adivinhar do conteúdo — o dado simplesmente não está lá.

## O que já existe

- **Login** — box translúcida, contorno rosa neon, paleta roxo metálico /
  violeta escuro. Sem Firebase configurado, usa a senha hardcoded; com
  Firebase configurado, autentica de verdade via Firebase Auth.
- **Sidebar** — seletor de filiais (independentes entre si) com botão "+"
  para adicionar, navegação entre Vendas / Funcionários / Clientes / Gastos,
  e botão Sair.
- **Gráfico principal** (`PerformanceChart.jsx`) — período (semana/mês/ano/
  máximo/personalizado), alternância linha/pizza, e um modo por aba
  (vendas, por funcionário, gastos). Lê dados reais do Firestore quando
  configurado; sem `.env`, cai automaticamente no mock (`src/data/mockData.js`).
- **Aba Vendas** (`VendasTab.jsx`) — lançamento manual de um dia + importação
  de PDF (Caixa Diário específico, ou Caixa Antigo/Período generalista via
  "Vendas por Mês").
- **Aba Funcionários** (`FuncionariosTab.jsx`) — cadastro (nome, % comissão,
  salário base), edição inline, "reiniciar valores" após pagamento, e
  importação de vendas mensais por funcionário.
- **Aba Clientes** (`ClientesTab.jsx`) — cadastro simples, alimentado também
  automaticamente pela importação do Caixa Diário (todo cliente novo
  identificado no relatório é cadastrado, deduplicado por nome completo
  normalizado). É o alicerce pra uma futura "Vendas por Cliente"
  (gráfico + busca por período) — ainda não implementada.
- **Aba Gastos** (`GastosTab.jsx`) — lançamento manual (categoria fixa +
  vínculo com funcionário/distribuidora/tipo de imposto conforme a
  categoria) + importação do "Histórico das Despesas" do caixa diário.

### Como o gráfico agrega dados reais (e as limitações assumidas)

`useRealFilialData` (hook) assina em tempo real `registrosDiarios`,
`registrosMensaisHistoricos`, `vendasPorFuncionarioMensal`, `gastos` e
`funcionarios` da filial ativa. `realAggregation.js` transforma isso em
séries prontas pro gráfico. Simplificações conscientes:

- **Lucro** = vendas do dia − despesas do caixa diário − gastos avulsos
  daquele dia. **Não desconta comissão de funcionário** — comissão só é
  calculável com granularidade mensal, e misturar um desconto mensal dentro
  de uma série diária distorceria os dias individuais.
- **Vendas Totais** mistura pontos diários com pontos mensais do histórico
  agregado, mas só para meses que **não têm nenhum registro diário** (evita
  contar em dobro) — uma aproximação visual, não uma distribuição diária real.
- **Por funcionário** sempre usa granularidade mensal (é o que existe), então
  o eixo X vira "mês" nesse modo. Períodos curtos como "semana" tendem a não
  mostrar nada — é esperado, não é bug.
- **Promissória/crediário**: os relatórios reais do CDS não usam uma
  categoria literal "PROMISSÓRIA" — vendas parceladas aparecem como formas
  de pagamento próprias (ex: "VISA PARC", "MASTER PARC", "BOLETO"), e o
  "Total" impresso por venda parcelada já soma todas as parcelas contratadas
  (não só o que entra naquele dia). O parser atual trata esse total como
  receita do dia da venda, no mesmo espírito do CDS — ainda não há uma
  separação entre "venda reconhecida" e "dinheiro efetivamente recebido"
  (regime de caixa vs. competência). Ver discussão sobre isso no histórico
  de decisões do projeto antes de mexer aqui.

## Configurar o Firebase (passo a passo)

1. **Criar o projeto**: [console.firebase.google.com](https://console.firebase.google.com)
   → "Adicionar projeto" → nome livre (ex: `imperium-das-chaves`) → não
   precisa Google Analytics.
2. **Ativar o Firestore**: menu lateral → "Firestore Database" → "Criar banco
   de dados" → modo produção → região `southamerica-east1` (São Paulo).
3. **Registrar um app Web**: tela inicial do projeto → ícone `</>` → nome
   livre → **não** marque Firebase Hosting (o deploy é pelo Vercel).
4. **Copiar credenciais**: o Firebase mostra um bloco `firebaseConfig`. Copie
   cada valor para um arquivo `.env` na raiz (baseado em `.env.example`).
5. **Publicar regras e índices**:
   ```bash
   npm install -g firebase-tools   # se ainda não tiver
   firebase login
   # edite .firebaserc trocando SEU-PROJECT-ID-AQUI pelo ID real do projeto
   firebase deploy --only firestore:rules,firestore:indexes
   ```
6. **Ativar Firebase Authentication**: console → "Authentication" → "Get
   started" → método "E-mail/senha" → ativar.
7. **Criar seu usuário de acesso**: "Authentication" → "Users" → "Add user".
   Use o e-mail definido em `src/config/auth.js` (`ACCESS_EMAIL`) e a senha
   que você quiser usar no login do app.
8. **Rodar o app** com o `.env` preenchido (`npm run dev`) e testar o login.

Não há mais passo de Cloud Functions/Gemini — a pasta `functions/` existe
só como placeholder válido pro `firebase.json`, sem nada rodando nela hoje
(ver comentário no topo de `functions/index.js`).

## Deploy no Vercel

`vercel.json` já está pronto (build Vite padrão + rewrite de SPA). Passos:

1. Suba o projeto num repositório Git (GitHub/GitLab/Bitbucket) — o Vercel
   deploya a partir daí.
2. No dashboard do Vercel: "Add New Project" → importe o repositório.
3. Em "Environment Variables", adicione as mesmas 6 variáveis `VITE_FIREBASE_*`
   do seu `.env` local.
4. Deploy.

## Schema do Firestore

```
filiais/{filialId}
  nome, criadoEm

filiais/{filialId}/funcionarios/{funcionarioId}
  nome, comissaoPercentual, salarioBase, ativo

filiais/{filialId}/clientes/{clienteId}
  nome, origem: "manual" | "caixa-diario"

filiais/{filialId}/gastos/{gastoId}
  data, categoria, valor, descricao
  funcionarioId?, funcionarioNome?    (categorias vinculadas a funcionário)
  distribuidora?                       (categoria PEDIDOS)
  tipoImposto?                         (categoria IMPOSTOS)
  origem: "manual" | "importado-caixa-diario", criadoEm

filiais/{filialId}/listasAuxiliares/{nomeLista}
  valores: string[]   ("distribuidoras", "tiposImposto" — crescem sozinhas)

filiais/{filialId}/registrosDiarios/{YYYY-MM-DD}
  origem: "manual" | "importado-caixa-diario"
  vendas: { dinheiro, cartao, pix, boleto, promissoria, outros,
            totalAVista, totalAPrazo, totalVendas }
  criadoEm

filiais/{filialId}/registrosMensaisHistoricos/{YYYY-MM}
  origem: "manual" | "importado-periodo"
  totalVendas, criadoEm

filiais/{filialId}/vendasPorFuncionarioMensal/{funcionarioId}_{YYYY-MM}
  funcionarioId, funcionarioNome, mes, totalVendido
  origem: "manual" | "importado-periodo", criadoEm
```

## Segurança

- `firestore.rules` exige `request.auth != null` em tudo — só funciona
  depois que Firebase Authentication estiver ativo. Como hoje só existe um
  usuário (você), a regra não distingue permissões — é tudo ou nada para
  quem estiver logado.
- Todo o parsing de PDF acontece no navegador — nenhum arquivo é enviado
  para servidor nenhum além do próprio Firestore (só os dados extraídos,
  depois de você revisar e confirmar).
- **Sessão não persiste entre recarregamentos de página** ainda (o app não
  escuta `onAuthStateChanged` do Firebase) — cada vez que a página recarrega,
  pede login de novo. É uma limitação conhecida, não um bug.

## Estrutura de pastas

```
src/
  components/      Login, Dashboard, Sidebar, PerformanceChart, seletores,
                    VendasTab, FuncionariosTab, ClientesTab, GastosTab
  config/          auth.js (senha legado), firebase.js (init real)
  data/            mockData.js (dados fictícios do gráfico), categoriasGasto.js
  hooks/           useFilialCollection.js (CRUD Firestore genérico por filial)
                    useFilialListaAuxiliar.js, usePdfImport.js
  parsers/         pdfToText.js, caixaDiario.js, despesasCaixa.js
                    — parsing 100% client-side, sem IA
  styles/          tokens.css (paleta, tipografia, variáveis globais)
functions/
  index.js         placeholder (sem lógica ativa — ver "Por que não tem mais IA")
firestore.rules
firestore.indexes.json
firebase.json
vercel.json
```

## Próximos passos sugeridos

1. Persistência de sessão de login (`onAuthStateChanged`).
2. "Vendas por Cliente": gráfico + busca por cliente na aba Clientes.
3. Separar regime de caixa (dinheiro que entrou de verdade) de regime de
   competência (venda reconhecida na hora, mesmo parcelada) — ver nota
   sobre promissória/crediário acima.
4. Cálculo real de Lucro incluindo comissão de funcionário.
5. Integração com extrato bancário (BB/Itaú) e conciliação de cartão (Rede)
   — avaliada em discussão, ainda não iniciada.


## Navegação por teclado (todos os cadastros)

Vale para Vendas (manual), Gastos, Funcionários (vendas do mês e cadastro) e Clientes:

- **Enter** avança para o próximo campo na ordem em que ele aparece na tela e, no
  último campo, envia o formulário (não é preciso um Enter extra em cima do botão).
- **Seletores** (categoria, funcionário, distribuidora, tipo de imposto) entram nessa
  mesma fila — o Enter para neles em vez de pular por cima. Dentro de um seletor:
  `↑`/`↓` abrem e percorrem a lista, `Enter` escolhe e já avança, `Esc` fecha.
  Nos seletores de texto livre (distribuidora/imposto), se você digitou um nome novo
  e não usou as setas, o Enter mantém o que você digitou e avança.
- Escolher uma categoria que abre um campo extra (Adiantamento/Salário → Funcionário,
  Pedidos → Distribuidora) leva o foco para esse campo novo, não para o Valor.
- **Depois de enviar**, o foco volta sozinho para o primeiro campo do formulário.
- No gráfico, em *Período → Personalizado*, o foco já cai na data de início; Enter vai
  para a data de fim e o Enter seguinte aplica o período.

A lógica fica em `src/utils/formNav.js`; seletores usam `src/components/Combobox.jsx`
(o antigo `SearchableSelect` foi removido — era o que não respondia ao Enter).


## Conciliação bancária (abas Extrato e Pendências)

### De onde vêm os dados do banco

Não há integração automática com o BB. O Open Finance / API de extratos do Banco
do Brasil exige credenciais de aplicação, certificado e contrato — nada disso
roda num app client-side. O fluxo é: você exporta o extrato no BB Digital e
importa o arquivo na aba **Extrato**.

Formatos aceitos, em ordem de confiabilidade:

1. **OFX** — formato estruturado, com ID próprio por lançamento e campo de nome
   separado do histórico. **Prefira este.**
2. **CSV** — funciona, mas o BB não separa o nome de quem pagou do histórico, então
   o nome é extraído por heurística.
3. **PDF** — último recurso. O layout muda de tempos em tempos e o parser é
   baseado em posição de texto.

O parser está em `src/parsers/extratoBB.js` e foi testado contra amostras
sintéticas dos três formatos, **não contra um extrato real seu** — quando você
importar o primeiro extrato de verdade, confira a prévia antes de confirmar e me
mande o arquivo (pode anonimizar os valores) se algo vier torto.

### Associar conta a cliente

Botão direito em qualquer linha do extrato > **Associar cliente**. O vínculo é por
conta, identificada pelo CPF/CNPJ quando o banco informa, ou pelo nome normalizado
quando não informa. Um cliente pode ter várias contas associadas — é o caso comum
(cônjuge, empresa, conta de terceiro).

### Aba Pendências

Duas tabelas lado a lado: as vendas individuais do Caixa Diário do CDS (esquerda)
e os pagamentos recebidos no extrato (direita).

**Aplicar Baixas** (automático) só fecha par **1:1**, com três condições
simultâneas:

- a conta que pagou tem cliente associado;
- o nome do cliente é **exatamente igual** ao nome na venda do CDS (comparação
  literal, com acento e maiúscula; só espaço repetido é normalizado);
- o valor é **exatamente igual**, até o centavo.

Além disso, se houver mais de uma venda candidata **ou** mais de um pagamento
candidato para o mesmo par nome+valor, a automação recua e deixa pendente. Ela
nunca junta várias vendas com vários pagamentos — isso é exclusivamente manual.

A rigidez é deliberada: clientes costumam compartilhar sobrenomes e diferir por um
único nome do meio. Flexibilizar (ignorar acento, comparar primeiro nome, distância
de edição) trocaria "não conciliou sozinho" por "conciliou na pessoa errada", que é
um erro muito mais caro e que só aparece meses depois.

**Baixa manual**: clique nas linhas dos dois lados (ficam azuis) e use "Dar baixa na
seleção". Se os totais não baterem, o app mostra a diferença e pergunta o destino
dela (dinheiro, Pix fora do extrato, cartão, boleto, promissória/crediário,
desconto — ou, quando sobra, troco/crédito do cliente). A resposta fica registrada
junto da baixa.

**Retenção de 7 dias**: baixas fechadas ficam visíveis no rodapé por uma semana e
depois são apagadas junto com as linhas da fila, para não inflar o banco. Os dados
que importam (registro diário de vendas, extrato) continuam nas suas coleções. Botão
direito numa baixa fechada > **Restaurar venda** devolve as linhas para a fila.

### Aba Clientes

Ganhou busca por nome e, ao clicar num cliente, um gráfico de quanto ele pagou por
mês. A fonte é o extrato: só entram pagamentos de contas associadas àquele cliente.
Compra paga em dinheiro na loja não passa pelo banco e, portanto, não aparece ali.

### Segunda senha

A aba Extrato pede a senha de novo antes de exibir qualquer dado bancário, e o
desbloqueio vale só enquanto a aba está aberta (trocar de aba ou de filial tranca de
novo). Isso não é barreira criptográfica — quem passou do login tem sessão no
Firebase — é proteção contra extrato aberto e esquecido numa tela no balcão.

### Coleções novas no Firestore

`extratoLancamentos`, `vinculosBancarios`, `pendenciasVendas`, `baixas`. Todas já
estão no `firestore.rules` — **é preciso rodar `firebase deploy --only
firestore:rules` antes de usar**, senão dá permission-denied.


## Correção: leitura do PDF do extrato BB (baseada no seu arquivo real)

O parser de PDF (`src/parsers/extratoBB.js`) foi refeito depois de testar contra o
extrato de verdade que você mandou. O problema era estrutural: o BB imprime cada
lançamento em **duas linhas** —

```
16/09/2026 0000 14397 821 Pix - Recebido 160.818.558.327.982 330,30 C
16/09 08:18 41245127000158 H J M IMPOR
```

A primeira traz histórico e valor; a segunda (quando existe) traz o horário, o
CPF/CNPJ de quem pagou (colado, sem formatação) e o nome — muitas vezes truncado
pelo próprio BB por causa da largura da coluna ("H J M IMPOR" em vez do nome
completo). O parser antigo só olhava a primeira linha, então nunca via quem tinha
pago — daí o "Pix - . . . ." aparecendo tanto no Extrato quanto em Pendências.

Rodei o novo parser contra os 131 lançamentos do seu extrato de 16–17/09 (usando
`pdftotext -layout` como substituto do pdfjs-dist, que não instala neste ambiente
sandbox sem rede — a extração de texto do app usa pdfjs, mas agrupa por linha do
mesmo jeito, então o resultado é equivalente) e todos os nomes, CPFs/CNPJs e
valores bateram com o extrato original, inclusive os casos sem nome legível (só
CNPJ truncado) e sem linha de detalhe (Cobrança, S A L D O).

Lançamentos sem segunda linha (Cobrança, tarifas) continuam sem contraparte — não
tem como saber quem é sem essa informação no PDF, e é melhor deixar em branco do
que inventar um nome a partir do histórico. "Lançamentos futuros" (boletos
agendados, ainda não pagos) são ignorados de propósito: não são dinheiro que já
entrou ou saiu da conta.

Se o próximo extrato vier com um layout um pouco diferente (o BB muda isso de vez
em quando) e algum nome não aparecer, me manda o PDF (pode editar os valores) que
eu ajusto de novo.


## Sessão: remoção da 2ª senha, gráfico fora de Extrato/Pendências, gastos vermelhos e mais

- **Senha do Extrato**: removida — a única barreira de acesso agora é o login normal do app.
- **Gráfico**: some completamente nas abas Extrato e Pendências (antes ficava sempre visível
  no topo, mesmo sem fazer sentido nessas telas).
- **Duplicidade extrato x período repetido**: em vez de tentar detectar sobreposição de datas
  depois do fato (frágil), o import agora **exige um único dia por arquivo** — se o PDF/OFX/CSV
  trouxer mais de uma data, a importação é recusada com uma mensagem pedindo pra gerar o extrato
  de novo com "de" e "até" iguais. Combinado com o ID determinístico por lançamento (que já
  existia), reimportar o mesmo dia sempre atualiza as mesmas linhas — nunca duplica. Essa
  restrição já existia pro Caixa Diário do CDS; agora é simétrica no Extrato.
- **Pendências, aba débitos**: uma terceira coluna "Extrato — gastos (débitos)" mostra TODO
  débito do extrato, categorizado ou não. Débito com categoria (associada via "Associar Gasto"
  na aba Extrato) fecha sozinho ao clicar em "Aplicar Baixas" — sem precisar de par do lado do
  CDS — e aparece na lista de fechados em **vermelho**, pra diferenciar de venda fechada
  (verde). Botão direito nele também restaura.
- **Promissória**: sempre visível nas Pendências, elegível para a mesma baixa automática 1:1
  por nome+valor exatos (nenhuma mudança de código foi necessária aqui — o motor de conciliação
  já não discriminava por forma de pagamento). O toggle que antes escondia "vendas em dinheiro"
  virou "ocultar promissórias" (default ligado, porque cresce rápido perto do caixa diário);
  dinheiro passou a ficar sempre fora da tela (nunca tem contrapartida bancária possível).
- **Cliente / vendas em dinheiro**: o total e o gráfico por cliente (aba Clientes) agora somam
  também vendas em dinheiro do Caixa Diário, casadas pelo nome exato do cadastro — mesmo
  critério rígido usado na conciliação automática (nome parecido não conta).
- Corrigido: a regra do Firestore para `vinculosGastoBancarios` (usada por "Associar Gasto")
  não existia — rode `firebase deploy --only firestore:rules` de novo.
- `PasswordGate.jsx`/`.css`, que ficaram órfãos depois da senha sair do Extrato, foram removidos.


## Sessão: revisão de Extrato/Clientes já implementados + reverter salário/comissão

Ao revisar o código antes de mexer, boa parte do pedido já estava implementada de uma sessão
anterior:
- Extrato: a tabela já é única (créditos e débitos juntos, ordenados por data) — só faltava
  diferenciar a cor de uma linha fechada por venda (verde) da fechada por gasto categorizado
  (vermelho). Corrigido: `is-conciliado` (verde) vs `is-conciliado-gasto` (vermelho).
- Clientes: o gráfico próprio da aba, com busca/Combobox centralizada no topo pra escolher o
  cliente, já existia — e o gráfico principal do topo do dashboard já não aparece nessa aba.
  Se ainda aparecer pra você, é sinal de estar rodando um build anterior a este.

## Funcionários: "Reiniciar valores" virou dois botões

Como salário e comissão são pagos em dias diferentes, um botão só que mexia nos dois ao mesmo
tempo forçava fechar ambos juntos. Agora:
- **Reverter salário** — apaga os adiantamentos do mês dos selecionados (zera "Descontos").
  Use no dia que pagar o salário.
- **Reverter comissão** — zera a venda do mês usada no cálculo da comissão (zera "Comissão").
  Use no dia que pagar a comissão.

Nenhum dos dois mexe no salário base nem no outro valor.

## Extrato: por que alguns nomes não aparecem

Dois motivos possíveis, e são diferentes um do outro:

1. **O BB genuinamente não imprimiu um nome legível.** Em pagamentos de empresa às vezes a
   segunda linha do lançamento traz só um pedaço do CNPJ repetido em vez do nome (ex.: CNPJ
   "04251235000107" seguido de "04 251 235" — não é um nome, é o mesmo CNPJ picotado). O parser
   já extrai e mostra o CNPJ nesses casos; o nome fica em branco porque não existe nome nenhum
   pra mostrar, não porque o parser falhou.
2. **Falha real de leitura de PDF** (menos provável, mas possível): o extrato do BB imprime
   cada lançamento em duas linhas — uma com histórico/valor, outra (menor, com CPF/CNPJ e nome)
   logo abaixo. O agrupamento por linha depende da posição Y de cada trecho de texto no PDF; se
   a segunda linha ficar exatamente na mesma faixa de 2px da primeira (ou a uma distância
   incomum), ela pode não ser reconhecida como "linha de detalhe" e o nome se perde. Se isso
   acontecer com um lançamento que você **sabe** que tem nome no BB Digital, me manda esse PDF
   (pode editar os valores) que eu ajusto a tolerância do agrupamento.

## Como funciona o controle do arquivo do extrato hoje

Sim, é diário. Desde a sessão anterior, o parser (`src/parsers/extratoBB.js`) rejeita de cara
qualquer arquivo que traga mais de uma data — o BB Digital deixa você gerar com "de" e "até"
iguais, e é isso que o app espera. Cada lançamento recebe um ID determinístico (o FITID do OFX
quando existe; senão um hash de data+valor+histórico, desambiguado por ordem de aparição), então
reimportar o mesmo dia sempre **atualiza** as mesmas linhas em vez de duplicar — mesmo que você
importe o mesmo dia dez vezes. Categorizações e associações já feitas (Associar Cliente/Gasto)
sobrevivem à reimportação porque a escrita usa `merge: true`.
