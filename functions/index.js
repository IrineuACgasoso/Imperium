// Este projeto não usa mais Cloud Functions para importação de dados.
//
// Até esta reformulação, a importação de relatórios do CDS passava por uma
// Cloud Function que mandava o PDF pro Gemini (IA) extrair os valores. Isso
// foi removido de propósito: os relatórios do CDS são gerados por template
// fixo (mesma estrutura sempre), então um parser de texto determinístico no
// próprio navegador (ver src/parsers/ no app) é mais confiável, mais rápido,
// não depende de uma API externa nem tem custo por importação, e ainda
// valida sozinho se a soma bate com o total impresso no relatório — coisa
// que a IA generalista não garantia.
//
// O parsing agora acontece 100% no cliente (React) e grava direto no
// Firestore, usando as mesmas regras de segurança de sempre (usuário
// autenticado). Não há mais nada rodando no backend além do próprio
// Firestore/Auth do Firebase.
//
// Este arquivo fica como um placeholder válido para o `firebase deploy`
// (o firebase.json ainda referencia a pasta functions). Se um dia este
// projeto precisar de lógica de servidor de novo — por exemplo, para
// consumir APIs de banco (BB/Itaú/Rede) com credenciais que não podem viver
// no navegador — é aqui que ela entraria.
