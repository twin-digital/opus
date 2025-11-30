import { randomUUID } from 'node:crypto'

export interface ExpeditionJson {
  id: string
}

/**
 * An Expedition is any venture outside of a settlement or other save haven. It represents any time spent "in the field",
 * regardless of distance travelled. An {@link Adventure} is typically composed of one or more Expeditions. Expeditions
 * themselves are divided into three primary types of activities:
 *
 * - {@link Journey}: Travelling between wilderness hexes with the goal of reaching a destination
 * - {@link Survey}: Thorough exploration within a single hex, with the goal of finding a specific feature or "anything
 *   interesting"
 * - {@link Delve}: Investigation of a localized site such as a ruin, barrow, cave, or faerie landmark.
 */
export class Expedition {
  public constructor(public readonly id: string = randomUUID()) {}

  public fromJSON(_state: ExpeditionJson): void {
    /* noop */
  }

  public toJSON(): ExpeditionJson {
    return {
      id: this.id,
    }
  }
}
