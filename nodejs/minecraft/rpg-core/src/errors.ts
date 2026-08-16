/**
 * Thrown by every call acting on an actor whose entity type is not registered in the world. The
 * check covers the definitions only: a call that passes it says nothing about whether the actor
 * will render.
 */
export class ActorDefinitionsMissingError extends Error {
  /** The preset the failed call named. */
  readonly preset: string
  /** The entity identifier that is not registered. */
  readonly identifier: string
  /** The display name of the pack that supplies the missing definitions. */
  readonly pack: string

  constructor(preset: string, identifier: string, pack: string) {
    super(
      `Entity type '${identifier}' for preset '${preset}' is not registered in this world. ` +
        `Install and activate the '${pack}' behavior pack.`,
    )
    this.name = 'ActorDefinitionsMissingError'
    this.preset = preset
    this.identifier = identifier
    this.pack = pack
  }
}
