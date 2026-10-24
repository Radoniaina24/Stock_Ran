import { z } from 'zod'

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'L’adresse e-mail est obligatoire.')
    .email('Adresse e-mail invalide.'),
  password: z
    .string()
    .min(1, 'Le mot de passe est obligatoire.')
    .min(6, 'Le mot de passe doit contenir au moins 6 caractères.'),
})

export type LoginFormValues = z.input<typeof loginSchema>

export const LOGIN_DEFAULT_VALUES: LoginFormValues = {
  email: '',
  password: '',
}

export const passwordSchema = z.object({
  password: z
    .string()
    .min(1, 'Le mot de passe est obligatoire.')
    .min(6, 'Le mot de passe doit contenir au moins 6 caractères.'),
  confirmPassword: z.string().min(1, 'Confirmez le mot de passe.'),
})

export type PasswordFormValues = z.input<typeof passwordSchema>

export const PASSWORD_DEFAULT_VALUES: PasswordFormValues = {
  password: '',
  confirmPassword: '',
}

export const settingsSchema = z.object({
  appName: z
    .string()
    .trim()
    .min(1, 'Le nom de l’application est obligatoire.')
    .max(40, 'Le nom ne doit pas dépasser 40 caractères.'),
  density: z.enum(['comfortable', 'compact'], { error: 'Choisissez une densité.' }),
})

export type SettingsFormValues = z.input<typeof settingsSchema>

export const passwordMatchSchema = passwordSchema.refine(
  (values) => values.password === values.confirmPassword,
  { message: 'Les deux mots de passe ne correspondent pas.', path: ['confirmPassword'] },
)
