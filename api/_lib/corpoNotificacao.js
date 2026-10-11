// Lê o corpo enviado pelo celular com tolerância. O MacroDroid monta o texto trocando as variáveis, e uma notificação com aspas
// ("Compra em "LOJA"") deixa o JSON inválido. Aqui o JSON é o caminho normal; se falhar, recupera os campos pela posição
// das chaves, e aceita também texto simples no formato "chave: valor".
const CHAVES = ['token', 'app', 'aplicativo', 'titulo', 'title', 'texto', 'text', 'quando', 'hora']
const LIMITE = 20000

export function lerCorpoTexto(bruto) {
  const s = String(bruto ?? '').trim()
  if (!s) return null
  try {
    const j = JSON.parse(s)
    if (j && typeof j === 'object') return j
  } catch { /* segue para a leitura tolerante */ }
  const doJsonQuebrado = extrairJsonQuebrado(s)
  if (doJsonQuebrado) return doJsonQuebrado
  return extrairChaveValor(s)
}

// {"token":"x","app":"Nubank","titulo":"Compra","texto":"Compra em "LOJA" de R$ 10"}  → cada valor vai até a próxima chave.
function extrairJsonQuebrado(s) {
  const re = new RegExp(`"(${CHAVES.join('|')})"\\s*:\\s*"`, 'g')
  const achados = []
  let m
  while ((m = re.exec(s))) achados.push({ chave: m[1], ini: m.index, valorIni: re.lastIndex })
  if (achados.length < 2) return null
  const out = {}
  achados.forEach((a, i) => {
    const fim = i + 1 < achados.length ? achados[i + 1].ini : s.length
    let v = s.slice(a.valorIni, fim)
    v = i + 1 < achados.length ? v.replace(/"\s*,?\s*$/, '') : v.replace(/"?\s*}?\s*$/, '')
    out[a.chave] = v.replace(/\\"/g, '"').replace(/\\n/g, '\n')
  })
  return out
}

// token: fin_abc / app: Nubank / titulo: ... / texto: ... (o texto vai até o fim)
function extrairChaveValor(s) {
  const out = {}
  const linhas = s.split(/\r?\n/)
  let atual = null
  for (const l of linhas) {
    const m = l.match(new RegExp(`^\\s*(${CHAVES.join('|')})\\s*[:=]\\s*(.*)$`, 'i'))
    if (m) { atual = m[1].toLowerCase(); out[atual] = m[2] } else if (atual) out[atual] += `\n${l}`
  }
  const tem = Object.keys(out).length
  return tem ? Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.trim()])) : null
}

// Corpo da requisição: já interpretado pela plataforma (objeto/texto) ou, se o parser foi desligado, lido do fluxo.
export async function lerCorpo(req) {
  let b = req.body
  if (b === undefined && typeof req.on === 'function') {
    b = await new Promise((resolve) => {
      let acc = ''
      req.on('data', (c) => { if (acc.length < LIMITE) acc += c })
      req.on('end', () => resolve(acc))
      req.on('error', () => resolve(''))
    })
  }
  if (b && typeof b === 'object' && !Buffer.isBuffer(b)) return b
  return lerCorpoTexto(Buffer.isBuffer(b) ? b.toString('utf8') : b)
}
