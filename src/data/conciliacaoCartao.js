// Motor da conciliação CDS x extrato de maquininha (Rede, Itaú, ...).
//
// Diferente da conciliação bancária (ver conciliacao.js), aqui não existe
// nome de cliente: o cartão não identifica quem comprou. O único critério
// seguro pra baixa AUTOMÁTICA é bandeira + valor + mesmo dia. Assim como na
// conciliação por nome, qualquer ambiguidade (duas vendas candidatas, dois
// lançamentos candidatos) fica pendente — baixa errada é sempre pior que
// baixa pendente.

import { centavos } from './conciliacao.js';

/** Normaliza texto de bandeira pra comparação ('Mastercard', 'MASTERCARD', ' mastercard ' → 'MASTERCARD'). */
export function normalizaBandeira(b) {
  return (b ?? '').toString().trim().toUpperCase();
}

// A forma de pagamento gravada na venda do CDS vem como texto livre do
// relatório impresso pela loja ("VISA ROT", "MASTER PARC", "ELO DÉBITO",
// "VISA ELECTRON"...). A maquininha, por sua vez, informa a bandeira já
// normalizada ("Visa", "Mastercard", "Elo"). Este mapa liga um token
// encontrado dentro do texto do CDS à bandeira que a maquininha usa.
const TOKENS_BANDEIRA = [
  [/MASTER/, 'MASTERCARD'],
  [/VISA/, 'VISA'],
  [/ELO/, 'ELO'],
  [/HIPER/, 'HIPERCARD'],
  [/AMEX|AMERICAN\s*EXPRESS/, 'AMEX'],
];

/**
 * Extrai a bandeira normalizada de um texto de forma de pagamento do CDS.
 * Retorna null se a forma não for de cartão (Pix, boleto, promissória,
 * transferência, dinheiro etc) — essas nunca casam com a maquininha.
 */
export function bandeiraDeForma(forma) {
  const f = normalizaBandeira(forma);
  for (const [regex, bandeira] of TOKENS_BANDEIRA) {
    if (regex.test(f)) return bandeira;
  }
  return null;
}

/**
 * Casamento automático 1:1 entre vendas do CDS (pagas no cartão) e linhas
 * importadas do extrato da maquininha.
 *
 * @param {Array} vendas       vendas pendentes do CDS (já filtradas pra sem
 *                             baixa; forma/campo continuam livres aqui —
 *                             a função descarta sozinha o que não é cartão)
 * @param {Array} lancamentosCartao  linhas importadas da maquininha, já
 *                             filtradas pelo adquirente ativo (rede/itau) e
 *                             sem baixa
 * @returns {{ pares: Array<{venda, lancamento}>, motivos: Object }}
 */
export function casarAutomaticoCartao(vendas, lancamentosCartao) {
  const motivos = {
    formaNaoIdentificada: 0,
    semLancamentoCorrespondente: 0,
    ambiguo: 0,
  };

  const candidatos = vendas
    .filter((v) => !v.baixaId)
    .map((v) => ({ venda: v, bandeira: bandeiraDeForma(v.forma) }));

  const lancamentosAbertos = lancamentosCartao.filter((l) => !l.baixaId);
  const lancamentosUsados = new Set();
  const pares = [];

  candidatos.forEach(({ venda, bandeira }) => {
    if (!bandeira) {
      motivos.formaNaoIdentificada += 1;
      return;
    }

    const compativeis = lancamentosAbertos.filter(
      (l) =>
        !lancamentosUsados.has(l.id) &&
        l.data === venda.data &&
        normalizaBandeira(l.bandeira) === bandeira &&
        centavos(l.valor) === centavos(venda.valor)
    );

    if (compativeis.length === 0) {
      motivos.semLancamentoCorrespondente += 1;
      return;
    }

    // Duas vendas com o mesmo valor, mesma bandeira, mesmo dia: impossível
    // saber qual lançamento da maquininha corresponde a qual. Fica pendente.
    if (compativeis.length > 1) {
      motivos.ambiguo += 1;
      return;
    }

    // E do outro lado: se esse mesmo lançamento também bate com outra venda
    // ainda não usada, também é ambíguo.
    const vendasCompativeis = candidatos.filter(
      ({ venda: outra, bandeira: b2 }) =>
        b2 === bandeira &&
        outra.data === venda.data &&
        centavos(outra.valor) === centavos(venda.valor)
    );
    if (vendasCompativeis.length > 1) {
      motivos.ambiguo += 1;
      return;
    }

    lancamentosUsados.add(compativeis[0].id);
    pares.push({ venda, lancamento: compativeis[0] });
  });

  return { pares, motivos };
}
