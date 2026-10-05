import { useState } from 'react'
import { CORES_PESSOA, proximaCorPessoa } from '../lib/utils'

export default function Pessoas({ store }) {
  const { pessoas, compras, fixos, integracoesTelegram, addPessoa, delPessoa, mudarCorPessoa, renomearPessoa } = store
  const [novoNome, setNovoNome] = useState('')
  const [saving, setSaving] = useState(false)

  async function criar() {
    const nome = novoNome.trim()
    if (!nome) return
    if (pessoas.some((p) => p.nome.toLowerCase() === nome.toLowerCase())) {
      alert('Já existe uma pessoa com esse nome.')
      return
    }
    setSaving(true)
    const ok = await addPessoa(nome, proximaCorPessoa(pessoas))
    setSaving(false)
    if (ok) setNovoNome('')
  }

  function renomear(pessoa) {
    const novo = window.prompt('Novo nome:', pessoa.nome)
    if (novo == null) return
    const nome = novo.trim()
    if (!nome || nome === pessoa.nome) return
    if (pessoas.some((p) => p.id !== pessoa.id && p.nome.toLowerCase() === nome.toLowerCase())) {
      alert('Já existe uma pessoa com esse nome.')
      return
    }
    renomearPessoa(pessoa.id, pessoa.nome, nome)
  }

  function remover(pessoa) {
    const nCompras = compras.filter((c) => c.pessoa === pessoa.nome).length
    const nFixos = fixos.filter((f) => f.pessoa === pessoa.nome).length
    const telegram = (integracoesTelegram || []).some((i) => i.pessoa_id === pessoa.id)
    if (confirm(`Remover "${pessoa.nome}"?\n\n${nCompras} compra${nCompras === 1 ? '' : 's'} e ${nFixos} conta${nFixos === 1 ? '' : 's'} fixa${nFixos === 1 ? '' : 's'} continuam com esse nome (ela só deixa de aparecer como opção).${telegram ? '\n\nA conexão dela com o bot do Telegram será apagada e o bot para de responder a ela.' : ''}`)) {
      delPessoa(pessoa.id)
    }
  }

  return (
    <div className="page">
      <div className="alert alert-blue">
        Pessoas usadas em Compras, Fixos e Cartões (titular). Renomear atualiza automaticamente os registros já
        lançados com o nome antigo; remover só tira da lista de opções — registros antigos mantêm o texto que já
        tinham.
      </div>

      <div className="toolbar">
        <input
          placeholder="Nova pessoa..."
          value={novoNome}
          onChange={(e) => setNovoNome(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && criar()}
          style={{ maxWidth: 260 }}
        />
        <button className="btn btn-primary" onClick={criar} disabled={!novoNome.trim() || saving}>
          + Nova pessoa
        </button>
      </div>

      <div className="card">
        {pessoas.length === 0 ? (
          <div className="empty">Nenhuma pessoa cadastrada.{'\n'}Crie a primeira acima para poder lançar compras e fixos.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Cor</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pessoas.map((p) => (
                <tr key={p.id}>
                  <td>
                    <span className={`badge badge-${p.cor}`} style={{ cursor: 'pointer' }} onClick={() => renomear(p)} title="Clique para renomear">
                      {p.nome}
                    </span>
                  </td>
                  <td>
                    <select
                      value={p.cor}
                      onChange={(e) => mudarCorPessoa(p.id, e.target.value)}
                      style={{ width: 120 }}
                    >
                      {CORES_PESSOA.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </td>
                  <td>
                    <button className="btn btn-danger" onClick={() => remover(p)}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
