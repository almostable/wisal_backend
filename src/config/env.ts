import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.url('DATABASE_URL must be a valid URL'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),

  // Initial Admin Seed Configuration
  ADMIN_EMAIL: z
    .string()
    .transform((val) => val.trim().toLowerCase())
    .pipe(z.email('ADMIN_EMAIL must be a valid email'))
    .optional(),
  ADMIN_PASSWORD: z
    .string()
    .min(16, 'ADMIN_PASSWORD must be at least 16 characters long')
    .optional(),
  ADMIN_ROLE: z.enum(['admin', 'moderator']).default('admin'),
})

export type Env = z.infer<typeof envSchema>

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.format())
  throw new Error('Invalid environment variables')
}

export const env = parsed.data
