import { describe, it, expect } from 'vitest'
import { explicarErro, amigavel } from '../erros'

describe('explicarErro', () => {
  it('mensagem já amigável passa direto', () => { expect(explicarErro(amigavel('Já existe uma fatura desse cartão nesse mês.'), 'salvar')).toBe('Já existe uma fatura desse cartão nesse mês.') })
  it('duplicado', () => { expect(explicarErro({ code: '23505', message: 'duplicate key value violates unique constraint "faturas_cartao_id_mes_key"' }, 'salvar a fatura')).toMatch(/Não foi possível salvar a fatura[\s\S]*Já existe um registro igual/) })
  it('ligação antiga da importação aponta para o inbox/40', () => { expect(explicarErro({ code: '23503', message: 'insert or update on table "compras" violates foreign key constraint "compras_importacao_id_fkey"', details: 'Key is not present in table "importacoes".' }, 'importar a fatura')).toMatch(/inbox\/40_importacao_corrige_ligacao/) })
  it('cartão em uso', () => { expect(explicarErro({ code: '23503', message: 'update or delete on table "cartoes" violates foreign key constraint' }, 'apagar o cartão')).toMatch(/em uso por outros registros/) })
  it('campo obrigatório com nome claro', () => { expect(explicarErro({ code: '23502', message: 'null value in column "cartao_id" of relation "compras"' }, 'salvar')).toMatch(/campo obrigatório: cartão/) })
  it('tabela e coluna que faltam apontam para o SQL', () => {
    expect(explicarErro({ code: 'PGRST205', message: "Could not find the table 'public.fixos_valores' in the schema cache" }, 'carregar')).toMatch(/tabela "fixos_valores"[\s\S]*Rode o arquivo SQL/)
    expect(explicarErro({ code: 'PGRST204', message: "Could not find the 'grupo_id' column of 'compras' in the schema cache" }, 'salvar')).toMatch(/coluna "grupo_id"/)
  })
  it('rede e sessão', () => {
    expect(explicarErro(new TypeError('Failed to fetch'), 'salvar')).toMatch(/Sem conexão/)
    expect(explicarErro({ message: 'JWT expired', code: 'PGRST301' }, 'salvar')).toMatch(/sessão expirou/)
  })
  it('permissão', () => { expect(explicarErro({ code: '42501', message: 'new row violates row-level security policy' }, 'salvar')).toMatch(/falta de permissão/) })
  it('desconhecido mostra o detalhe técnico', () => { expect(explicarErro(new Error('boom'), 'salvar')).toMatch(/erro inesperado[\s\S]*Detalhe técnico: boom/) })
})
