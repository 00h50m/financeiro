// Carregamento por seção (em vez de só a tela inteira): linhas cinzas animadas.
export default function Esqueleto({ linhas = 3 }) {
  return (
    <div className="esqueleto" role="status" aria-label="Carregando">
      {Array.from({ length: linhas }, (_, i) => <div key={i} className="skeleton esqueleto-linha" style={{ width: i === linhas - 1 ? '60%' : '100%' }} />)}
    </div>
  )
}
