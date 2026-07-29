/** Building a fake: one place that knows how a generated class is instantiated. */

import { FAKE_CLASSES } from '../generated/index.js'

import type { FakeState } from './member.js'

/** What a caller supplies to build a fake; everything else takes its resting value. */
export interface FakeOptions {
  readonly data: unknown
  /** Values emitted as own data properties — an entity's `typeId` and `id`. */
  readonly own?: Readonly<Record<string, unknown>>
  /** The entity a component or effect hangs off, whose validity it follows. */
  readonly owner?: FakeState
}

const classes = FAKE_CLASSES as Readonly<Record<string, (new (state: FakeState) => object) | undefined>>

/** Builds the fake for a declared class by name, with the state its behaviour will read. */
export const construct = (className: string, options: FakeOptions): object => {
  const FakeClass = classes[className]
  if (!FakeClass) {
    throw new TypeError(`@minecraft/server declares no faked class ${className}`)
  }
  return new FakeClass({
    className,
    own: options.own ?? {},
    owner: options.owner,
    valid: true,
    data: options.data,
  })
}
