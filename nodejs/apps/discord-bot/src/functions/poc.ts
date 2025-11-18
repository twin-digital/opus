import type { Context } from 'aws-lambda'

export const handler = (_: unknown, _context: Context): void => {
  console.log('something is being printed')
}
