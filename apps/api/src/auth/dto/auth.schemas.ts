import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('e-mail inválido').max(255),
  password: z
    .string()
    .min(8, 'a senha deve ter ao menos 8 caracteres')
    .max(128, 'a senha é muito longa'),
  displayName: z
    .string()
    .min(2, 'o nome deve ter ao menos 2 caracteres')
    .max(80, 'o nome é muito longo'),
});

export const loginSchema = z.object({
  email: z.string().email('e-mail inválido').max(255),
  password: z.string().min(1, 'a senha é obrigatória').max(128),
});

export type RegisterDto = z.infer<typeof registerSchema>;
export type LoginDto = z.infer<typeof loginSchema>;
