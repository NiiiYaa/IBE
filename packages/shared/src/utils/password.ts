export const PASSWORD_MIN_LENGTH = 8

export function validatePassword(password: string): string[] {
  const errors: string[] = []
  if (password.length < PASSWORD_MIN_LENGTH) errors.push(`At least ${PASSWORD_MIN_LENGTH} characters`)
  if (!/[A-Z]/.test(password)) errors.push('At least one uppercase letter')
  if (!/[a-z]/.test(password)) errors.push('At least one lowercase letter')
  if (!/[0-9]/.test(password)) errors.push('At least one number')
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('At least one special character')
  return errors
}

export function isPasswordValid(password: string): boolean {
  return validatePassword(password).length === 0
}
