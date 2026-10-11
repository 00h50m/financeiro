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

  const usoDe = (p) => ({
    compras: compras.filter((c) => c.pessoa === p.nome).length,
    fixos: fixos.filter((f) => f.pessoa === p.nome).length,
    telegram: (integracoesTelegram || []).some((i) => i.pessoa_id === p.id),
  })

  return (
    <div className="page">
      <details className="ajuda-rec">
        <summary>Como funciona</summary>
        <p>Pessoas usadas em Compras, Fixos e Cartões (titular). Renomear atualiza automaticamente os registros já lançados com o nome antigo; remover só tira da lista de opções — registros antigos mantêm o texto que já tinham.</p>
      </details>

      <div className="cad-novo">
        <input
          placeholder="Nome da nova pessoa"
          value={novoNome}
          onChange={(e) => setNovoNome(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && criar()}
        />
        <button className="btn btn-primary" onClick={criar} disabled={!novoNome.trim() || saving}>+ Nova pessoa</button>
      </div>

      {pessoas.length === 0 ? (
        <div className="card"><div className="empty">Nenhuma pessoa cadastrada.{'\n'}Crie a primeira acima para poder lançar compras e fixos.</div></div>
      ) : (
        <div className="cad-grade">
          {pessoas.map((p) => {
            const u = usoDe(p)
            return (
              <article key={p.id} className="cad-tile">
                <div className="cad-tile-topo">
                  <span className={`cad-avatar badge-${p.cor}`} aria-hidden="true">{p.nome.trim().slice(0, 1).toUpperCase()}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="cad-tile-nome">{p.nome}</div>
                    <div className="cad-sub">{u.compras} {u.compras === 1 ? 'compra' : 'compras'} · {u.fixos} {u.fixos === 1 ? 'conta fixa' : 'contas fixas'}</div>
                  </div>
                  {u.telegram && <span className="badge badge-blue" title="Esta pessoa conversa com o bot no Telegram">Telegram</span>}
                </div>
                <div className="cad-cores" role="group" aria-label={`Cor de ${p.nome}`}>
                  {CORES_PESSOA.map((c) => (
                    <button key={c} className={`cad-cor badge-${c} ${p.cor === c ? 'sel' : ''}`} onClick={() => mudarCorPessoa(p.id, c)} aria-label={`Cor ${c}`} aria-pressed={p.cor === c} />
                  ))}
                </div>
                <div className="cad-tile-acoes">
                  <button className="btn btn-ghost btn-sm" onClick={() => renomear(p)}>Renomear</button>
                  <button className="btn btn-danger" onClick={() => remover(p)} aria-label={`Remover ${p.nome}`}>×</button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
