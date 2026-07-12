import { group } from '../ui/components/group.js'
import type { Drawable } from '../ui/drawable.js'

/**
 * An entity represents a persistent object in a program, which can be drawn and receives periodic updates.
 */
export interface Entity {
  /**
   * Returns the root component of the entity's visual representation, if any.
   */
  getDrawable?(): Drawable

  /**
   * Aliveness check for entities which can self-expire. If this method returns false, the entity will be removed from
   * the program. Entities will never be auto-removed if this method is undefined.
   */
  isAlive?(): boolean

  /**
   * Called at a fixed interval to advance the entity's state. May be undefined if the entity does not perform any
   * proactive updates.
   *
   * @param elapsedSeconds Elapsed time, in seconds, from when the last update was performed.
   */
  update?(elapsedSeconds: number): void
}

/**
 * Interface for objects which manage collection of entties, ensuring that they are updated, drawn, and destroyed as
 * needed.
 */
export interface EntityManager {
  /**
   * Registers an entity , so it will be drawn and updated. Returns the id of the entity, which can
   * be used to call `remove` if needed.
   */
  add(entity: Entity): number

  /**
   * Removes the entity with the specified id.
   */
  remove(id: number): void
}

export class SimpleEntityManager implements EntityManager {
  private entities: Map<number, Entity> = new Map<number, Entity>()
  private nextId = 1

  /**
   * Registers an entity with the program, so it will be drawn and updated. Returns the id of the entity, which can
   * be used to call `remove` if needed.
   */
  public add(entity: Entity): number {
    const id = this.nextId++
    this.entities.set(id, entity)
    return id
  }

  /**
   * Removes all entities.
   */
  public clear(): void {
    this.entities.clear()
  }

  /**
   * Returns a root drawable which will draw all registered entities.
   */
  public getDrawable(): Drawable {
    const entityDrawables = Array.from(this.entities, ([_, entity]) => {
      return entity.getDrawable?.()
    }).filter((item) => item !== undefined)

    return group(...entityDrawables)
  }

  /**
   * Removes the entity with the specified id.
   */
  public remove(id: number) {
    this.entities.delete(id)
  }

  /**
   * Calls `update` on all registered entities which have an update function. If any entity returns false for 'isAlive'
   * after being updated, it will be removed.
   */
  public update(elapsedSeconds: number) {
    for (const [id, entity] of this.entities) {
      entity.update?.(elapsedSeconds)
      if (!(entity.isAlive?.() ?? true)) {
        this.remove(id)
      }
    }
  }
}
