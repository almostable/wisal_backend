import { z } from 'zod'
import {
  ALLOWED_IMAGE_EXTENSIONS,
  ALLOWED_TYPES,
  FILE_KEY_REGEX,
} from '../../lib/s3'

export const fileKeySchema = z
  .string()
  .trim()
  .regex(FILE_KEY_REGEX, 'Invalid file key format')

export const mediaItemSchema = z.object({
  fileKey: fileKeySchema,
  width: z.coerce.number().int().positive('Width must be a positive integer'),
  height: z.coerce.number().int().positive('Height must be a positive integer'),
})

export const mediaPayloadSchema = z.object({
  media: z
    .array(mediaItemSchema)
    .min(1, 'At least 1 media item is required')
    .max(10, 'At most 10 media items are allowed'),
})

export const presignRequestSchema = z
  .object({
    ext: z.enum(ALLOWED_IMAGE_EXTENSIONS, {
      message: `Invalid extension. Allowed extensions: ${ALLOWED_IMAGE_EXTENSIONS.join(', ')}`,
    }),
    contentType: z.string().trim().min(1, 'contentType is required'),
  })
  .superRefine((data, ctx) => {
    const extLower = data.ext.toLowerCase()
    const allowedMimes = ALLOWED_TYPES[extLower]
    if (!allowedMimes || !allowedMimes.includes(data.contentType.toLowerCase())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `MIME type '${data.contentType}' is not valid for extension '${data.ext}'`,
        path: ['contentType'],
      })
    }
  })
  .transform((data) => ({
    ext: data.ext,
    contentType: data.contentType.toLowerCase(),
  }))

export type PresignRequestInput = z.infer<typeof presignRequestSchema>
export type MediaItemInput = z.infer<typeof mediaItemSchema>
export type MediaPayloadInput = z.infer<typeof mediaPayloadSchema>
