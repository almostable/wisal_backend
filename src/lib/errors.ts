import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

export interface AppExceptionOptions {
  message: string
  code?: string
  details?: Record<string, unknown>
  cause?: unknown
}

export class AppException extends HTTPException {
  readonly code?: string
  readonly details?: Record<string, unknown>

  constructor(status: ContentfulStatusCode, options: AppExceptionOptions) {
    super(status, { message: options.message, cause: options.cause })
    this.code = options.code
    this.details = options.details
  }
}
