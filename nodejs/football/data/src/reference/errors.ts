/** Thrown when a source presents a value outside the closed reference sets. Ingest never passes unknowns through. */
export class UnknownReferenceValueError extends Error {
  constructor(
    readonly kind: string,
    readonly source: string,
    readonly value: unknown,
  ) {
    super(`Unknown ${kind} from ${source}: ${JSON.stringify(value)}`)
    this.name = 'UnknownReferenceValueError'
  }
}
