import { z } from 'zod'
import { emailSchema } from '../../db/schema/common'
import { rawPasswordSchema } from '../../db/schema/accounts'
import { inviteCodeSchema } from '../../db/schema/invites'

export const registerInputSchema = z.object({
  email: emailSchema,
  password: rawPasswordSchema,
  inviteCode: inviteCodeSchema,
})

export const loginInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
})

export const deleteAccountInputSchema = z.object({
  password: z.string().min(1, 'Password is required'),
})

export type RegisterInput = z.infer<typeof registerInputSchema>
export type LoginInput = z.infer<typeof loginInputSchema>
export type DeleteAccountInput = z.infer<typeof deleteAccountInputSchema>

