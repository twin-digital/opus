import { z } from 'zod'

/**
 * Health-check payload for the Daemon's `/healthz` endpoint. Carries the
 * liveness `status` and the running build `version` (ops visibility / smoke
 * test), the two fields the daemon serves.
 */
export const healthSchema = z.object({
  status: z.literal('ok'),
  version: z.string(),
})

export type Health = z.infer<typeof healthSchema>
