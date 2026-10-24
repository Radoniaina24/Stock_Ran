import { describe, expect, it } from 'vitest'
import { passwordChecks, passwordStrength } from './password'

describe('passwordStrength', () => {
  it('ne note pas un mot de passe vide', () => {
    expect(passwordStrength('')).toEqual({ score: 0, label: '' })
  })

  it('signale un mot de passe sous le minimum requis', () => {
    expect(passwordStrength('Ab1!').score).toBe(1)
  })

  it('progresse avec les critères de robustesse', () => {
    expect(passwordStrength('abcdef').score).toBe(2)
    expect(passwordStrength('abcdef12').score).toBe(2)
    expect(passwordStrength('Abcdef12').score).toBe(3)
    expect(passwordStrength('Abcdef12!').score).toBe(4)
    expect(passwordStrength('Abcdef12!').label).toBe('Fort')
  })
})

describe('passwordChecks', () => {
  it('indique les critères remplis', () => {
    const met = passwordChecks('motdepasse1').filter((c) => c.met).map((c) => c.id)
    expect(met).toEqual(['length', 'long', 'digit'])
  })
})
