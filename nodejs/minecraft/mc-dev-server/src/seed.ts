import { randomBytes } from 'node:crypto'

/** The inclusive bounds the server keeps a seed exactly within; anything else it hashes as text. */
export const SEED_MIN = -9223372036854775808n
export const SEED_MAX = 9223372036854775807n

/** A seed outside the signed 64-bit range, which the server would hash rather than keep. */
export class SeedRangeError extends Error {
  constructor(value: string) {
    super(`seed ${value} is outside the signed 64-bit range ${SEED_MIN}..${SEED_MAX}`)
    this.name = 'SeedRangeError'
  }
}

/** Reads a seed off the command line. The range is exact: one past either end is rejected. */
export const parseSeed = (value: string): bigint => {
  if (!/^[+-]?\d+$/.test(value.trim())) {
    throw new SeedRangeError(value)
  }
  const seed = BigInt(value.trim())
  if (seed < SEED_MIN || seed > SEED_MAX) {
    throw new SeedRangeError(value)
  }
  return seed
}

/** A uniformly random signed 64-bit seed, the harness's own pick when a run names none. */
export const randomSeed = (): bigint => BigInt.asIntN(64, randomBytes(8).readBigUInt64BE())

/** A seed as it reaches the server and the harness's record: plain decimal. */
export const formatSeed = (seed: bigint): string => seed.toString(10)
