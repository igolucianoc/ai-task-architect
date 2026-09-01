import { z } from 'zod';

/**
 * Entrada do endpoint de criação/geração de tarefa.
 * Limites de tamanho alinhados ao modelo de domínio (50–2000 chars).
 */
export const createTaskSchema = z.object({
  description: z
    .string()
    .trim()
    .min(50, 'a descrição deve ter ao menos 50 caracteres')
    .max(2000, 'a descrição deve ter no máximo 2000 caracteres'),
});

export type CreateTaskDto = z.infer<typeof createTaskSchema>;

export const listTasksQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export type ListTasksQueryDto = z.infer<typeof listTasksQuerySchema>;
