import { expect, it } from 'vitest'
import { emailEndPoint } from '../src/features/auth/emailEndPoint'

it('never reads values from a password or other non-email input', () => {
  const password = document.createElement('input')
  password.type = 'password'
  Object.defineProperty(password, 'value', {
    get() {
      throw new Error('Password value must not be read')
    },
  })
  expect(emailEndPoint(password, document.createElement('span'))).toBeNull()
})
