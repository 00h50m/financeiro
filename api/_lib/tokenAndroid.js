// Token do celular Android: aparece uma vez para quem pediu (/android); no banco fica só o hash SHA-256.
import crypto from 'node:crypto'

export const gerarTokenAndroid = () => `fin_${crypto.randomBytes(24).toString('hex')}`
export const hashToken = async (token) => crypto.createHash('sha256').update(String(token)).digest('hex')
