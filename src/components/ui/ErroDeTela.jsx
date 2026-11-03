import { Component } from 'react'

// Se uma tela não carregar (por exemplo, depois de uma atualização do app, quando o arquivo antigo não existe mais),
// mostra uma mensagem com a saída óbvia em vez de uma página em branco.
export default class ErroDeTela extends Component {
  state = { erro: null }
  static getDerivedStateFromError(erro) { return { erro } }
  componentDidCatch(erro) { console.error('Falha ao carregar a tela', erro) } // eslint-disable-line no-console
  render() {
    if (!this.state.erro) return this.props.children
    return (
      <div className="page" role="alert">
        <div className="alert alert-red">
          <b>Não consegui abrir esta tela.</b>
          <div style={{ fontSize: 13, marginTop: 4 }}>Isso costuma acontecer logo depois de uma atualização do app ou com a conexão instável. Recarregue para tentar de novo; seus dados não foram afetados.</div>
          <button type="button" className="btn btn-primary btn-sm" style={{ marginTop: 10 }} onClick={() => window.location.reload()}>Recarregar</button>
        </div>
      </div>
    )
  }
}
