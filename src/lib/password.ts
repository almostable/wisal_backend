export async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, {
    algorithm: 'argon2id',
    memoryCost: 65536,
    timeCost: 3,
  })
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await Bun.password.verify(password, passwordHash)
  } catch {
    return false
  }
}
