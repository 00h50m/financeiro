import ModalCompra from './ModalCompra'
import { partesDoGrupo } from '../lib/divisaoCompra'

// Abre o formulário de edição de uma compra (ou de todas as partes, se for compra dividida em categorias).
// Mesma fiação da tela de Compras, para quem quer editar uma compra de outro lugar (ex.: dentro de uma fatura).
export default function EditarCompra({ store, compra, onClose }) {
  const { compras, cartoes, categorias, pessoas, comprasPagamentos, updateCompra, salvarDivisao } = store
  const partes = partesDoGrupo(compras, compra.grupo_id)
  const grupo = partes.length >= 2 ? partes : null
  const ids = (grupo || [compra]).map((c) => c.id)
  return (
    <ModalCompra
      cartoes={cartoes}
      categorias={categorias}
      pessoas={pessoas}
      editar={grupo ? null : compra}
      grupo={grupo}
      gruposOk={compras.some((c) => 'grupo_id' in c)}
      faturaMesOk={compras.some((c) => 'fatura_mes' in c)}
      avisoPagamentos={(comprasPagamentos || []).some((p) => ids.includes(p.compra_id))}
      onSave={(dados) => updateCompra(compra.id, dados)}
      onSaveDivisao={salvarDivisao}
      onClose={onClose}
    />
  )
}
