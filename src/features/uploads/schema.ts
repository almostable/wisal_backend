import { z } from 'zod'
import {
  ALLOWED_IMAGE_EXTENSIONS,
  ALLOWED_TYPES,
  FILE_KEY_REGEX,
  MAX_UPLOAD_FILE_SIZE,
} from '../../lib/s3'

import { MAX_POST_MEDIA_COUNT, MAX_COMMENT_MEDIA_COUNT } from '../../config/constants'

export const fileKeySchema = z
  .string()
  .trim()
  .regex(FILE_KEY_REGEX, 'Invalid file key format')

export const mediaItemSchema = z.object({
  fileKey: fileKeySchema,
  width: z.coerce.number().int().positive('Width must be a positive integer'),
  height: z.coerce.number().int().positive('Height must be a positive integer'),
})

export const postMediaPayloadSchema = z.object({
  media: z
    .array(mediaItemSchema)
    .min(1, 'At least 1 media item is required')
    .max(MAX_POST_MEDIA_COUNT, `At most ${MAX_POST_MEDIA_COUNT} media items are allowed`),
})

export const commentMediaPayloadSchema = z.object({
  media: z
    .array(mediaItemSchema)
    .min(1, 'At least 1 media item is required')
    .max(MAX_COMMENT_MEDIA_COUNT, `At most ${MAX_COMMENT_MEDIA_COUNT} media item is allowed`),
})

export const removablePostMediaPayloadSchema = z.object({
  media: z.array(mediaItemSchema.strict()).max(MAX_POST_MEDIA_COUNT),
}).strict()

export const removableCommentMediaPayloadSchema = z.object({
  media: z.array(mediaItemSchema.strict()).max(MAX_COMMENT_MEDIA_COUNT),
}).strict()

export const mediaPayloadSchema = postMediaPayloadSchema

export const presignRequestSchema = z
  .object({
    ext: z.enum(ALLOWED_IMAGE_EXTENSIONS, {
      message: `Invalid extension. Allowed extensions: ${ALLOWED_IMAGE_EXTENSIONS.join(', ')}`,
    }),
    contentType: z.string().trim().min(1, 'contentType is required'),
    size: z.coerce
      .number({ message: 'size is required' })
      .int('Size must be an integer')
      .positive('Size must be a positive integer')
      .max(
        MAX_UPLOAD_FILE_SIZE,
        `File size must not exceed ${MAX_UPLOAD_FILE_SIZE / (1024 * 1024)}MB`
      ),
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
  .transform((data): { ext: typeof data.ext; contentType: string; size: number } => ({
    ext: data.ext,
    contentType: data.contentType.toLowerCase(),
    size: data.size,
  }))

export type PresignRequestInput = z.infer<typeof presignRequestSchema>
export type MediaItemInput = z.infer<typeof mediaItemSchema>
export type PostMediaPayloadInput = z.infer<typeof postMediaPayloadSchema>
export type CommentMediaPayloadInput = z.infer<typeof commentMediaPayloadSchema>
export type MediaPayloadInput = PostMediaPayloadInput
