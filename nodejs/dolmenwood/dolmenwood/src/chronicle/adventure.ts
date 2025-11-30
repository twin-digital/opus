import { randomUUID } from 'node:crypto'

export interface AdventureJson {
  id: string
}

/**
 * An adventure is a major narrative arc in a {@link Campaign} with a central purpose. Examples include:
 *
 * - Rebuild the ruined abbey
 * - Free the lost prince
 * - Break the faerie curse
 *
 * An Adventure is composed of multiple expeditions and downtime periods. A character may be participating in multiple
 * adventures simultaneously, depending on the scale of time and urgency for each adventure.
 *
 * This is just a placeholder currently.
 */
export class Adventure {
  public constructor(public readonly id: string = randomUUID()) {}

  public fromJSON(_state: AdventureJson): void {
    /* noop */
  }

  public toJSON(): AdventureJson {
    return {
      id: this.id,
    }
  }
}
