export interface PasswordCheck {
  id: 'length' | 'long' | 'case' | 'digit' | 'symbol'
  label: string
  met: boolean
}

export function passwordChecks(password: string): PasswordCheck[] {
  return [
    { id: 'length', label: '6 caractères minimum', met: password.length >= 6 },
    { id: 'long', label: '10 caractères ou plus', met: password.length >= 10 },
    { id: 'case', label: 'Majuscules et minuscules', met: /[a-z]/.test(password) && /[A-Z]/.test(password) },
    { id: 'digit', label: 'Au moins un chiffre', met: /\d/.test(password) },
    { id: 'symbol', label: 'Au moins un caractère spécial', met: /[^A-Za-z0-9]/.test(password) },
  ]
}

export type PasswordScore = 0 | 1 | 2 | 3 | 4

const LABELS: Record<PasswordScore, string> = {
  0: '',
  1: 'Trop court',
  2: 'Faible',
  3: 'Correct',
  4: 'Fort',
}

/** 0 : vide · 1 : sous le minimum requis · 2 à 4 : selon les critères de robustesse remplis. */
export function passwordStrength(password: string): { score: PasswordScore; label: string } {
  if (!password) return { score: 0, label: LABELS[0] }
  const checks = passwordChecks(password)
  if (!checks[0]!.met) return { score: 1, label: LABELS[1] }
  const extras = checks.slice(1).filter((check) => check.met).length
  const score: PasswordScore = extras >= 3 ? 4 : extras === 2 ? 3 : 2
  return { score, label: LABELS[score] }
}
