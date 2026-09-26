import { env } from '../config/env'

export interface TurnstileVerifyResponse {
  success: boolean
  'error-codes'?: string[]
  challenge_ts?: string
  hostname?: string
  action?: string
  cdata?: string
}

export const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export async function verifyTurnstileToken(
  token: string,
  remoteIp?: string
): Promise<boolean> {
  const trimmedToken = token?.trim()
  if (!trimmedToken) {
    return false
  }

  if (env.NODE_ENV === 'test' && trimmedToken === 'test-turnstile-token') {
    return true
  }

  try {
    const body = new URLSearchParams()
    body.append('secret', env.CLOUDFLARE_TURNSTILE_SECRET_KEY)
    body.append('response', trimmedToken)
    if (remoteIp && remoteIp !== 'anonymous') {
      body.append('remoteip', remoteIp)
    }

    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    })

    if (!response.ok) {
      return false
    }

    const data = (await response.json()) as TurnstileVerifyResponse
    return Boolean(data.success)
  } catch (error) {
    console.error('Failed to verify Turnstile token:', error)
    return false
  }
}
