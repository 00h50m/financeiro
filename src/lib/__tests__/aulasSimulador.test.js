import { describe, it, expect } from 'vitest'
import { agendaSemanal, cargaMinutos, receitaMensal, mediaHora, conflitos, janelasLivres, simularNovoAluno, lerLimite, SEMANAS_POR_MES } from '../aulasSimulador'

const alunos = [
  { id: 'a', nome: 'Ana', ativo: true, valor_hora_centavos: 10000 },
  { id: 'b', nome: 'Bia', ativo: true, valor_hora_centavos: 8000, saida_prevista: '2026-12-20' },
  { id: 'c', nome: 'Caio', ativo: false, valor_hora_centavos: 9000 },
]
const prog = (aluno, dia, horario, duracao_min, extra = {}) => ({ aluno_id: aluno, dia_semana: dia, horario, duracao_min, vigencia_inicio: '2026-01-01', vigencia_fim: null, ...extra })
const progs = [prog('a', 2, '14:00', 60), prog('a', 4, '14:00', 60), prog('b', 2, '16:00', 90), prog('c', 2, '10:00', 60), prog('a', 1, '09:00', 60, { vigencia_fim: '2026-06-30' })]
const hoje = '2026-10-21'

describe('simulador de novo aluno', () => {
  const slots = agendaSemanal(alunos, progs, hoje)
  it('agenda: só ativos e vigentes', () => {
    expect(slots).toHaveLength(3)
    expect(cargaMinutos(slots)).toBe(60 + 60 + 90)
    expect(mediaHora(slots)).toBe(Math.round((10000 * 120 + 8000 * 90) / 210))
    expect(receitaMensal(slots)).toBe(Math.round((10000 * 2 + 8000 * 1.5) * SEMANAS_POR_MES))
  })
  it('conflito e janelas livres', () => {
    const c = conflitos(slots, [{ dia: 2, inicio: 14 * 60 + 30, duracao: 60 }, { dia: 2, inicio: 15 * 60, duracao: 60 }, { dia: 3, inicio: 14 * 60, duracao: 60 }])
    expect(c).toHaveLength(1) // só 14:30 bate (com a Ana); 15:00 encosta mas não bate
    const livres = janelasLivres(slots, 2)
    expect(livres).toEqual([{ de: '06:00', ate: '14:00', minutos: 480 }, { de: '15:00', ate: '16:00', minutos: 60 }, { de: '17:30', ate: '22:00', minutos: 270 }])
  })
  it('compensa quando cabe no limite, sem conflito e valor acima da média', () => {
    const r = simularNovoAluno({ slots, novos: [{ dia: 3, horario: '14:00', duracao: 60 }], valorHora: 12000, limiteMin: 20 * 60, metaCentavos: 0, hoje })
    expect(r.veredito).toBe('compensa')
    expect(r.ganhoMensal).toBe(Math.round(12000 * SEMANAS_POR_MES))
    expect(r.depoisMin).toBe(270)
    expect(r.receitaDepois).toBe(r.receitaAntes + r.ganhoMensal)
  })
  it('não: conflito ou passa do limite; apertado: valor baixo', () => {
    expect(simularNovoAluno({ slots, novos: [{ dia: 2, horario: '14:30', duracao: 60 }], valorHora: 9000, limiteMin: 0, hoje }).veredito).toBe('nao')
    expect(simularNovoAluno({ slots, novos: [{ dia: 5, horario: '10:00', duracao: 60 }], valorHora: 9000, limiteMin: 4 * 60, hoje }).veredito).toBe('nao')
    expect(simularNovoAluno({ slots, novos: [{ dia: 5, horario: '10:00', duracao: 60 }], valorHora: 5000, limiteMin: 20 * 60, hoje }).veredito).toBe('apertado')
    expect(simularNovoAluno({ slots, novos: [], valorHora: 9000, hoje }).veredito).toBe('incompleto')
  })
  it('saída prevista reduz a receita estimada e meta é considerada', () => {
    const r = simularNovoAluno({ slots, novos: [{ dia: 3, horario: '14:00', duracao: 60 }], valorHora: 10000, limiteMin: 0, metaCentavos: 100000, hoje })
    expect(r.receitaSemSaidas).toBeLessThan(r.receitaDepois)
    expect(r.pontos.some((p) => p.texto.includes('saída prevista'))).toBe(true)
  })
  it('limite lido da config', () => { expect(lerLimite({ aulas_limite_horas_semana: '20' })).toBe(1200); expect(lerLimite({})).toBe(0) })
})
