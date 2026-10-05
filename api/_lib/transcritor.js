// Transforma um recado de voz em texto com o Whisper (Large v3 Turbo) hospedado na Groq.
// O texto entra no mesmo fluxo de uma mensagem digitada: resumo + Confirmar, nada é lançado sozinho.
const URL_GROQ = 'https://api.groq.com/openai/v1/audio/transcriptions'
const MODELO = 'whisper-large-v3-turbo'

export function criarTranscritor(apiKey, { fetchImpl = fetch } = {}) {
  return {
    // audio: { base64, mediaType, extensao }. Devolve o texto (ou null se não saiu nada). O erro nunca leva a chave.
    async transcrever(audio) {
      const form = new FormData()
      form.append('file', new Blob([Buffer.from(audio.base64, 'base64')], { type: audio.mediaType }), `audio.${audio.extensao === 'oga' ? 'ogg' : audio.extensao}`)
      form.append('model', MODELO)
      form.append('language', 'pt')
      form.append('response_format', 'json')
      form.append('temperature', '0')
      let r
      try {
        r = await fetchImpl(URL_GROQ, { method: 'POST', headers: { authorization: `Bearer ${apiKey}` }, body: form, signal: AbortSignal.timeout(20000) })
      } catch (e) {
        throw Object.assign(new Error('Groq: falha de rede'), { name: e?.name === 'TimeoutError' ? 'TimeoutError' : 'ConnectionError' })
      }
      if (!r.ok) throw Object.assign(new Error(`Groq: HTTP ${r.status}`), { status: r.status })
      const j = await r.json().catch(() => ({}))
      const texto = typeof j.text === 'string' ? j.text.replace(/\s+/g, ' ').trim() : ''
      return texto || null
    },
  }
}
