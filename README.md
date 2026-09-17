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
