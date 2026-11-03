// Estado vazio padrão: diz o que falta e oferece o próximo passo.
export default function EstadoVazio({ titulo, texto, acao, aoClicar }) {
  return (
    <div className="estado-vazio" role="status">
      {titulo && <div className="estado-vazio-titulo">{titulo}</div>}
      {texto && <div className="estado-vazio-texto">{texto}</div>}
      {acao && aoClicar && <button type="button" className="btn btn-primary" onClick={aoClicar}>{acao}</button>}
    </div>
  )
}
