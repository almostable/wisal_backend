import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware } from '../../middleware/auth'
import { registerInputSchema, loginInputSchema } from './schema'
import {
  registerUser,
  loginUser,
  logoutUser,
  logoutAllSessions,
  getAuthMe,
} from './service'

export const authRouter = new Hono()

authRouter.post('/register', zValidator('json', registerInputSchema), async (c) => {
  const data = c.req.valid('json')
  const result = await registerUser(data)

  return c.json(
    {
      success: true,
      ...result,
    },
    201
  )
})

authRouter.post('/login', zValidator('json', loginInputSchema), async (c) => {
  const data = c.req.valid('json')
  const result = await loginUser(data)

  return c.json({
    success: true,
    ...result,
  })
})

authRouter.post('/logout', authMiddleware, async (c) => {
  const session = c.get('session')

  if (session) {
    await logoutUser(session.id)
  }

  return c.json({
    success: true,
    message: 'Logged out successfully',
  })
})

authRouter.post('/logout-all', authMiddleware, async (c) => {
  const account = c.get('account')

  if (account) {
    await logoutAllSessions(account.id)
  }

  return c.json({
    success: true,
    message: 'All sessions logged out successfully',
  })
})

authRouter.get('/me', authMiddleware, async (c) => {
  const account = c.get('account')
  const result = await getAuthMe(account.id)

  return c.json({
    success: true,
    ...result,
  })
})
