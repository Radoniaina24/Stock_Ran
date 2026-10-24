import { z } from 'zod'

/**
 * Champ numérique saisi comme chaîne (input HTML) puis converti en nombre.
 * Messages d'erreur entièrement en français.
 */
export function numberField(
  label: string,
  options: { min?: number; strictMin?: boolean; max?: number; required?: boolean } = {},
) {
  const { min = 0, strictMin = false, max, required = true } = options

  return z
    .string()
    .superRefine((value, ctx) => {
      const raw = value.trim().replace(',', '.')
      if (raw === '') {
        if (required) {
          ctx.addIssue({ code: 'custom', message: `${label} est obligatoire.` })
        }
        return
      }
      const parsed = Number(raw)
      if (!Number.isFinite(parsed)) {
        ctx.addIssue({ code: 'custom', message: `${label} doit être un nombre valide.` })
        return
      }
      if (strictMin ? parsed <= min : parsed < min) {
        ctx.addIssue({
          code: 'custom',
          message: strictMin
            ? `${label} doit être supérieur à ${min}.`
            : `${label} doit être supérieur ou égal à ${min}.`,
        })
        return
      }
      if (max !== undefined && parsed > max) {
        ctx.addIssue({
          code: 'custom',
          message: `${label} doit être inférieur ou égal à ${max}.`,
        })
      }
    })
    .transform((value) => {
      const raw = value.trim().replace(',', '.')
      return raw === '' ? 0 : Number(raw)
    })
}

export function optionalText(max: number, label: string) {
  return z
    .string()
    .max(max, `${label} ne doit pas dépasser ${max} caractères.`)
    .transform((value) => (value.trim() === '' ? null : value.trim()))
}
