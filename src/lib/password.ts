import bcrypt from 'bcryptjs'

const SALT_ROUNDS = 12

/**
 * Hash a plain text password using bcrypt
 */
export async function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, SALT_ROUNDS)
}

/**
 * Verify a plain text password against a bcrypt hash
 */
export async function verifyPassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(plainPassword, hashedPassword)
}

/**
 * Check if a string is already a bcrypt hash
 * Bcrypt hashes start with $2a$, $2b$, or $2y$
 */
export function isBcryptHash(value: string): boolean {
  return /^\$2[aby]\$\d+\$.{53}$/.test(value)
}
