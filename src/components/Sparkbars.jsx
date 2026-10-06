// Mini gráfico de barras (um valor por mês) para tabelas. O último valor (mês atual) fica destacado.
export default function Sparkbars({ valores, rotulos = [], cor = 'var(--blue)', altura = 22, destaqueUltimo = true }) {
  const max = Math.max(1, ...valores)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: altura }} role="img" aria-label={`Últimos ${valores.length} meses: ${valores.map((v, i) => `${rotulos[i] || ''} ${Math.round(v)}`).join(', ')}`}>
      {valores.map((v, i) => (
        <div key={i} title={`${rotulos[i] || ''}: R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          style={{ width: 6, height: Math.max(v > 0 ? 2 : 1, (v / max) * altura), background: destaqueUltimo && i === valores.length - 1 ? cor : 'var(--border)', borderRadius: 1, opacity: v > 0 ? 1 : 0.5 }} />
      ))}
    </div>
  )
}
