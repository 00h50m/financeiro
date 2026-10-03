import { useState } from 'react'
import { sb } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [entrando, setEntrando] = useState(false)
  const [erro, setErro] = useState('')

  async function entrar(e) {
    e.preventDefault()
    setErro('')
    setEntrando(true)
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: senha })
    setEntrando(false)
    if (error) {
      setErro(error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : 'Não foi possível entrar: ' + error.message)
    }
  }

  return (
    <div className="login">
      <form className="login-card" onSubmit={entrar}>
        <div className="login-logo">Gi & Sabi</div>
        <div className="login-sub">Financeiro · entre para continuar</div>

        <div className="form-group" style={{ marginBottom: 14 }}>
          <label htmlFor="login-email">E-mail</label>
          <input id="login-email" type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="form-group" style={{ marginBottom: 14 }}>
          <label htmlFor="login-senha">Senha</label>
          <input id="login-senha" type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
        </div>

        {erro && <div className="alert alert-red">{erro}</div>}

        <button className="btn btn-primary" type="submit" disabled={entrando} style={{ width: '100%', justifyContent: 'center' }}>
          {entrando ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
