import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { inviteApplicationRateLimiter, getClientIp } from '../../middleware/rate-limiter'
import { createInviteApplicationSchema } from './schema'
import { submitInviteApplication } from './service'

export const inviteApplicationsRouter = new Hono()

inviteApplicationsRouter.post(
  '/',
  inviteApplicationRateLimiter,
  zValidator('json', createInviteApplicationSchema),
  async (c) => {
    const data = c.req.valid('json')
    const ip = getClientIp(c)
    const userAgent = c.req.header('user-agent')

    const result = await submitInviteApplication(data, { ip, userAgent })

    return c.json(result, 201)
  }
)
