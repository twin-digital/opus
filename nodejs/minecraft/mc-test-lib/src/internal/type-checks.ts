/** Compile-time assertion helpers backing the drift checks on stub lists and enum mirrors. */

/**
 * Resolves to `true` only when `A` and `B` are mutually assignable — exact enough to pin the
 * key unions and literal types these checks compare.
 */
export type Equals<A, B> =
  [A] extends [B] ?
    [B] extends [A] ?
      true
    : false
  : false

/** Fails to compile unless `T` is `true`; use with {@link Equals} to pin a derived type. */
export type Expect<T extends true> = T
