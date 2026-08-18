import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().url().default('postgres://wisal:wisal@localhost:5432/wisal_db'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  ADMIN_EMAIL: z
    .string()
    .transform((val) => val.trim().toLowerCase())
    .pipe(z.string().email())
    .optional(),
  ADMIN_PASSWORD: z.string().min(16).optional(),
  ADMIN_ROLE: z.enum(['admin', 'moderator']).default('admin'),
})

export type Env = z.infer<typeof envSchema>

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.format())
  throw new Error('Invalid environment variables')
}

export const env = parsed.data
