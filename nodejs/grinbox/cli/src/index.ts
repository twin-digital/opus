import { healthSchema } from '@twin-digital/grinbox-shared'

/** Trivial entry point. The real CLI commands are built in later tasks. */
export function main(): void {
  const health = healthSchema.parse({ status: 'ok' })
  console.log(`grinbox cli: ${health.status}`)
}
