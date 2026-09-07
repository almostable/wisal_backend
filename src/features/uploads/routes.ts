import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { HTTPException } from 'hono/http-exception'
import { authMiddleware } from '../../middleware/auth'
import { getProfileByAccountId } from '../../lib/profile'
import { presignRequestSchema } from './schema'
import { generateUploadPresignedUrl } from './service'

export const uploadsRouter = new Hono()

uploadsRouter.use('*', authMiddleware)

uploadsRouter.post('/presign', zValidator('json', presignRequestSchema), async (c) => {
  const account = c.get('account')
  const profile = await getProfileByAccountId(account.id)
  if (!profile) {
    throw new HTTPException(404, { message: 'Profile not found' })
  }
  const input = c.req.valid('json')
  const result = await generateUploadPresignedUrl(input, profile.id)

  return c.json(
    {
      success: true,
      uploadUrl: result.uploadUrl,
      fileKey: result.fileKey,
      expiresIn: result.expiresIn,
    },
    200
  )
})
