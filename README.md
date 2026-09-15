# Imperium das Chaves

Sistema de gestão de performance de loja. React + Vite. Deploy alvo: Vercel.
Banco de dados: Firebase (Firestore + Auth + Functions).

## Rodando localmente

```bash
npm install
npm run dev
```

**Sem `.env` preenchido**, o app roda 100% no modo mock: senha hardcoded
(`src/config/auth.js`, `ACCESS_PASSWORD`), dados fictícios no gráfico, e as
abas Vendas/Funcionários/Gastos/Importar mostram um aviso pedindo para
configurar o Firebase. Nada quebra, é só um modo degradado para
desenvolvimento sem depender de credenciais reais.

**Com `.env` preenchido** (ver seção "Configurar o Firebase" abaixo), tudo
passa a ser real: login via Firebase Auth, filiais/funcionários/gastos/vendas
gravados no Firestore, e a importação por IA funcionando de ponta a ponta.

## O que já existe

- **Login** — box translúcida, contorno rosa neon, paleta roxo metálico /
  violeta escuro. Sem Firebase configurado, usa a senha hardcoded; com
  Firebase configurado, autentica de verdade via Firebase Auth (e-mail fixo
  + senha — ver "Configurar o Firebase").
- **Sidebar** — seletor de filiais (independentes entre si) com botão "+"
  para adicionar, navegação entre Vendas / Funcionários / Gastos / Importar
  dados (IA), e botão Sair.
- **Gráfico principal** (`PerformanceChart.jsx`) — período (semana/mês/ano/
  máximo/personalizado), alternância linha/pizza, seleção de métrica com
  "Por funcionário" abrindo lista de chips dentro do card. **Lê dados reais
  do Firestore** quando configurado (ver "Como o gráfico agrega dados reais"
  abaixo); sem `.env`, cai automaticamente no mock (`src/data/mockData.js`).
- **Aba Vendas** (`VendasTab.jsx`) — lançamento manual de um dia (mesmos
  campos do schema `registrosDiarios`) + lista dos dias já lançados (manual
  ou via IA).
- **Aba Funcionários** (`FuncionariosTab.jsx`) — cadastro de funcionário
  (nome, % comissão), ativar/inativar, remover.
- **Aba Gastos** (`GastosTab.jsx`) — lançamento manual de gastos avulsos
  (data, categoria, valor, descrição).
- **Aba Importar dados (IA)** (`ImportPanel.jsx`) — upload de documento →
  Gemini extrai dados estruturados → fica em `staging` pendente → você revisa
  cada campo (editável) → confirma ou rejeita. Nada da IA vai direto para o
  banco definitivo.
- **Cloud Functions** (`functions/`) — `extrairDocumento`, `confirmarStaging`,
  `rejeitarStaging`. Chave do Gemini fica só no servidor (secret do Firebase).

### Como o gráfico agrega dados reais (e as limitações assumidas)

`useRealFilialData` (hook) assina em tempo real `registrosDiarios`,
`registrosMensaisHistoricos`, `vendasPorFuncionarioMensal`, `gastos` e
`funcionarios` da filial ativa. `realAggregation.js` transforma isso em
séries prontas pro gráfico. Duas simplificações conscientes:

- **Lucro** = vendas do dia − despesas do caixa diário − gastos avulsos
  daquele dia. **Não desconta comissão de funcionário** — comissão só é
  calculável com granularidade mensal, e misturar um desconto mensal dentro
  de uma série diária distorceria os dias individuais. Fica para quando
  isso for pedido explicitamente.
- **Vendas Totais** mistura pontos diários com pontos mensais do histórico
  agregado, mas só para meses que **não têm nenhum registro diário** (evita
  contar em dobro). Isso significa um único ponto no dia 1 do mês
  representando o mês inteiro quando só existe o dado histórico agregado —
  uma aproximação visual, não uma distribuição diária real.
- **Por funcionário** sempre usa granularidade mensal (é o que existe), então
  o eixo X vira "mês" nesse modo, diferente do resto do gráfico que é diário.
  O seletor de período (semana/mês/ano) filtra essas datas normalmente, mas
  períodos curtos como "semana" tendem a não mostrar nada nesse modo — é
  esperado, não é bug.

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
   Use o e-mail definido em `src/config/auth.js` (`ACCESS_EMAIL`, hoje
   `dono@imperium-das-chaves.app` — pode trocar por outro antes de criar o
   usuário, só mantenha os dois iguais) e a senha que você quiser usar no
   login do app.
8. **Configurar o Gemini nas Cloud Functions**:
   ```bash
   cd functions && npm install
   firebase functions:secrets:set GEMINI_API_KEY
   # cole a chave gratuita obtida em https://aistudio.google.com/apikey
   firebase deploy --only functions
   ```
9. **Rodar o app** com o `.env` preenchido (`npm run dev`) e testar o login
   com a senha que você definiu no passo 7.

## Deploy no Vercel

`vercel.json` já está pronto (build Vite padrão + rewrite de SPA). Passos:

1. Suba o projeto num repositório Git (GitHub/GitLab/Bitbucket) — o Vercel
   deploya a partir daí.
2. No dashboard do Vercel: "Add New Project" → importe o repositório.
3. Em "Environment Variables", adicione as mesmas 6 variáveis `VITE_FIREBASE_*`
   do seu `.env` local.
4. Deploy. As Cloud Functions **não** fazem parte deste deploy — elas vivem
   no Firebase e são publicadas separadamente com `firebase deploy --only functions`.

## Schema do Firestore

```
filiais/{filialId}
  nome, criadoEm

filiais/{filialId}/funcionarios/{funcionarioId}
  nome, comissaoPercentual, ativo

filiais/{filialId}/gastos/{gastoId}
  data, categoria, valor, descricao, origem: "manual", criadoEm

filiais/{filialId}/registrosDiarios/{YYYY-MM-DD}
  origem: "ia-caixa-diario" | "manual"
  vendas: { dinheiro, cartao, pix, boleto, promissoria, outros,
            totalAVista, totalAPrazo, totalVendas }
  caixa: { saldoInicial, suprimento, sangria, despesas, vales, totalCaixa }
  ajustes: { descontos, trocas, cancelamentos, valeCredito }
  fonteArquivo, criadoEm

filiais/{filialId}/registrosMensaisHistoricos/{YYYY-MM}
  origem: "ia-grafico-historico" | "manual"
  totalVendas, granularidadeDiaria: false, fonteArquivo, criadoEm

filiais/{filialId}/vendasPorFuncionarioMensal/{funcionarioId}_{YYYY-MM}
  funcionarioId, mes, totalVendido, comissaoCalculada
  origem: "ia-relatorio-mensal-funcionario" | "manual", fonteArquivo, criadoEm

filiais/{filialId}/staging/{stagingId}
  tipo: "diario" | "mensal-historico" | "funcionario-mensal"
  dadosExtraidos: {...}
  status: "pendente" | "confirmado" | "rejeitado"
  criadoEm
```

Regra de ouro: **nada que a IA extrai vai direto para os registros
definitivos.** Sempre passa por `staging` com `status: "pendente"` até você
revisar e confirmar na aba "Importar dados (IA)".

## Segurança

- `firestore.rules` exige `request.auth != null` em tudo — só funciona
  depois que Firebase Authentication estiver ativo (passo 6/7 acima). Como
  hoje só existe um usuário (você), a regra não distingue permissões — é
  tudo ou nada para quem estiver logado.
- A chave do Gemini é um **secret** do Firebase Functions
  (`GEMINI_API_KEY`), nunca uma variável `VITE_*` — variáveis `VITE_*` vão
  para o bundle do navegador e ficariam visíveis a qualquer um.
- **Sessão não persiste entre recarregamentos de página** ainda (o app não
  escuta `onAuthStateChanged` do Firebase) — cada vez que a página recarrega,
  pede login de novo. É uma limitação conhecida, não um bug — dá pra
  resolver numa próxima sessão se incomodar no dia a dia.

## Estrutura de pastas

```
src/
  components/      Login, Dashboard, Sidebar, PerformanceChart, seletores,
                    VendasTab, FuncionariosTab, GastosTab, ImportPanel
  config/          auth.js (senha legado), firebase.js (init real),
                    extraction.js (chamadas às Cloud Functions)
  data/            mockData.js (dados fictícios do gráfico)
  hooks/           useFilialCollection.js (CRUD Firestore genérico por filial)
  styles/          tokens.css (paleta, tipografia, variáveis globais)
functions/
  index.js         extrairDocumento, confirmarStaging, rejeitarStaging
  src/prompts/      prompt + schema JSON por tipo de documento
firestore.rules
firestore.indexes.json
firebase.json
vercel.json
```

## Próximos passos sugeridos

1. Cálculo real de Lucro incluindo comissão (hoje o cálculo ignora
   comissão — ver limitações na seção do gráfico acima).
2. Persistência de sessão de login (`onAuthStateChanged`).
3. Deploy no Vercel (passo a passo mais abaixo).

## Lições da configuração inicial (evitar repetir)

- **Gere a chave do Gemini numa conta Google pessoal, sem faturamento
  vinculado** — não na mesma conta/projeto que tem o plano Blaze do Firebase
  ativado. Um projeto com faturamento vinculado faz o Gemini tratar as
  chamadas como modo pago com pré-pagamento, mesmo em modelos que deveriam
  ser gratuitos. Contas institucionais/Google Workspace também podem
  bloquear a API por política de administrador — prefira uma conta Gmail
  pessoal comum para essa chave especificamente.
- Nomes de modelo do Gemini mudam de geração com frequência (já trocamos de
  `gemini-2.5-flash` → `gemini-3.6-flash` → `gemini-3-flash-preview` só
  nesta configuração inicial). Se `extrairDocumento` voltar a dar erro 404
  de modelo, confira o nome atual em
  https://ai.google.dev/gemini-api/docs/pricing (coluna "Free tier") antes
  de mexer em qualquer outra coisa.
