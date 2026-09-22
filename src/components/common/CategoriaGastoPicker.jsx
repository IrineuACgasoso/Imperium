import { useMemo } from 'react';
import { CATEGORIAS_GASTO, CAMPO_EXTRA_GASTO } from '../../data/categoriasGasto.js';
import { useFilialCollection } from '../../hooks/useFilialCollection.js';
import Combobox from '../common/Combobox.jsx';

/**
 * Categoria de gasto + campo de referência que ela exige (funcionário,
 * distribuidora ou tipo de imposto), lado a lado. É a mesma dupla de campos
 * do formulário de Gastos, extraída pra ser usada também no "Associar
 * Gasto" do extrato — categorizar um débito do banco tem que seguir
 * exatamente a mesma estrutura de categorizar um gasto manual, ou os dois
 * viram fontes de verdade diferentes pro mesmo tipo de dado.
 *
 * `valor` é `{ categoria, extra, extraId }`; `onChange` recebe o objeto
 * inteiro atualizado.
 */
export default function CategoriaGastoPicker({ filialId, valor, onChange, minWidth = 190 }) {
  const { items: funcionarios } = useFilialCollection(filialId, 'funcionarios', 'nome');
  const { items: listasAux } = useFilialCollection(filialId, 'listasAuxiliares', 'criadoEm');

  const categoriaNormalizada = (valor.categoria ?? '').trim().toUpperCase();
  const campoExtra = CAMPO_EXTRA_GASTO[categoriaNormalizada] ?? null;

  const valoresDaLista = useMemo(() => {
    if (campoExtra?.tipo !== 'lista') return [];
    return listasAux.find((l) => l.id === campoExtra.lista)?.valores ?? [];
  }, [campoExtra, listasAux]);

  const opcoesExtra = useMemo(() => {
    if (!campoExtra) return [];
    if (campoExtra.tipo === 'funcionario') {
      return funcionarios.map((f) => ({ value: f.nome, label: f.nome, id: f.id }));
    }
    return valoresDaLista.map((v) => ({ value: v, label: v }));
  }, [campoExtra, funcionarios, valoresDaLista]);

  return (
    <div className="categoria-gasto-picker">
      <Combobox
        value={valor.categoria}
        onChange={(v) => onChange({ categoria: v, extra: '', extraId: '' })}
        options={CATEGORIAS_GASTO.map((c) => ({ value: c, label: c }))}
        placeholder="Categoria"
        allowFree={false}
        minWidth={minWidth}
      />
      {campoExtra && (
        <Combobox
          value={valor.extra}
          onChange={(v, option) => onChange({ ...valor, extra: v, extraId: option?.id ?? '' })}
          options={opcoesExtra}
          placeholder={campoExtra.label}
          allowFree={campoExtra.tipo === 'lista'}
          minWidth={minWidth}
        />
      )}
    </div>
  );
}

export { CAMPO_EXTRA_GASTO };
