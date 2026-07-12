import type { Drawable } from '../ui/drawable.js'
import { SimpleEntityManager, type Entity, type EntityManager } from './entity.js'

/**
 * A `Program` is an exclusive application which defines visual output displayed on a device and the types of input
 * interactions which can be performed.
 */
export interface Program {
  /**
   * Returns the root component of the program's UI.
   */
  getDrawable(): Drawable

  /**
   * Callback which performs optional initialization for this program.
   */
  initialize?: () => Promise<void> | void

  /**
   * Callback which performs optional cleanup (deregister event handlers, etc.) for this program.
   */
  shutdown?: () => Promise<void> | void

  /**
   * Called at a fixed interval to advance the program's state. May be undefined if a program does not perform any
   * proactive updates (i.e. only responds to user generated input events).
   *
   * @param elapsedSeconds Elapsed time, in seconds, from when the last update was performed.
   */
  update?(elapsedSeconds: number): void
}

export abstract class BaseProgram implements EntityManager, Program {
  private entityManager = new SimpleEntityManager()

  /**
   * Registers an entity with the program, so it will be drawn and updated. Returns the id of the entity, which can
   * be used to call `remove` if needed.
   */
  public add(entity: Entity): number {
    return this.entityManager.add(entity)
  }

  public getDrawable(): Drawable {
    return this.entityManager.getDrawable()
  }

  /**
   * Removes the entity with the specified id.
   */
  public remove(id: number) {
    this.entityManager.remove(id)
  }

  public update?(elapsedSeconds: number): void {
    this.entityManager.update(elapsedSeconds)
  }
}
