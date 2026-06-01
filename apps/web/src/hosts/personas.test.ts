import { describe, expect, it } from 'vitest'
import { HOST_PERSONAS } from './personas'

describe('HOST_PERSONAS', () => {
  it('has both hosts', () => {
    expect(Object.keys(HOST_PERSONAS).sort()).toEqual(['luca', 'lucy'])
  })

  it.each(['lucy', 'luca'] as const)('%s persona includes the core hard rules', (host) => {
    const p = HOST_PERSONAS[host]
    expect(p).toMatch(/Always tell the truth/)
    expect(p).toMatch(/Never invent chess facts/)
    expect(p).toMatch(/specific about WHY/)
    expect(p).toMatch(/1-2 sentences/)
  })

  it('Lucy persona names Lucy', () => {
    expect(HOST_PERSONAS.lucy).toMatch(/Your name is Lucy/)
    expect(HOST_PERSONAS.lucy).not.toMatch(/Your name is Luca/)
  })

  it('Luca persona names Luca and references Lucy as sister', () => {
    expect(HOST_PERSONAS.luca).toMatch(/Your name is Luca/)
    expect(HOST_PERSONAS.luca).toMatch(/twin brother/)
  })

  it('snapshots stay stable so prompt changes are reviewed deliberately', () => {
    expect(HOST_PERSONAS).toMatchSnapshot()
  })
})
