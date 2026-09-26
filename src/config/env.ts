import { z } from 'zod'

const isProduction = process.env.NODE_ENV === 'production'

const envSchema = z
  .object({
    DATABASE_URL: z
      .string()
      .url()
      .default('postgres://wisal:wisal@localhost:5432/wisal_db'),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(3000),
    CORS_ORIGIN: z.string().min(1, 'CORS_ORIGIN is required').default('http://localhost:5173'),
    ADMIN_EMAIL: z
      .string()
      .transform((val) => val.trim().toLowerCase())
      .pipe(z.string().email())
      .optional(),
    ADMIN_PASSWORD: z.string().min(16).optional(),
    ADMIN_ROLE: z.enum(['admin', 'moderator']).default('admin'),
    R2_ACCOUNT_ID: z.string().default('dummy-account-id'),
    R2_ACCESS_KEY_ID: z.string().default('dummy-access-key-id'),
    R2_SECRET_ACCESS_KEY: z.string().default('dummy-secret-access-key'),
    R2_BUCKET_NAME: z.string().default('wisal-media'),
    SENTRY_DSN: z.preprocess((val) => (val === '' ? undefined : val), z.string().url().optional()),
    CLOUDFLARE_TURNSTILE_SECRET_KEY: z
      .string()
      .default('1x0000000000000000000000000000000AA'),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production') {
      if (!process.env.DATABASE_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'DATABASE_URL is required in production environment',
          path: ['DATABASE_URL'],
        })
      }
      if (!process.env.R2_ACCOUNT_ID || data.R2_ACCOUNT_ID === 'dummy-account-id') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Valid R2_ACCOUNT_ID is required in production',
          path: ['R2_ACCOUNT_ID'],
        })
      }
      if (!process.env.R2_ACCESS_KEY_ID || data.R2_ACCESS_KEY_ID === 'dummy-access-key-id') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Valid R2_ACCESS_KEY_ID is required in production',
          path: ['R2_ACCESS_KEY_ID'],
        })
      }
      if (!process.env.R2_SECRET_ACCESS_KEY || data.R2_SECRET_ACCESS_KEY === 'dummy-secret-access-key') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Valid R2_SECRET_ACCESS_KEY is required in production',
          path: ['R2_SECRET_ACCESS_KEY'],
        })
      }
      if (
        !process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY ||
        data.CLOUDFLARE_TURNSTILE_SECRET_KEY === '1x0000000000000000000000000000000AA'
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Valid CLOUDFLARE_TURNSTILE_SECRET_KEY is required in production',
          path: ['CLOUDFLARE_TURNSTILE_SECRET_KEY'],
        })
      }
    }
  })

export type Env = z.infer<typeof envSchema>

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.format())
  throw new Error('Invalid environment variables')
}

export const env = parsed.data
