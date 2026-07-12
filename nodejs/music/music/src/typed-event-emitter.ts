// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EventMap = Record<string, (...args: any[]) => void>

/**
 * Type-safe event emitter.
 *
 * Use it like this:
 *
 * ```typescript
 * type MyEvents = {
 *   error: (error: Error) => void;
 *   message: (from: string, content: string) => void;
 * }
 *
 * const myEmitter = new EventEmitter() as TypedEmitter<MyEvents>;
 *
 * myEmitter.emit("error", "x")  // <- Will catch this type error;
 * ```
 */
export interface TypedEventEmitter<Events extends EventMap> {
  on<E extends keyof Events>(event: E, listener: Events[E]): this
  off<E extends keyof Events>(event: E, listener: Events[E]): this
  emit<E extends keyof Events>(event: E, ...args: Parameters<Events[E]>): boolean
}

export class Events<Events extends EventMap> {
  private listeners = new Map<keyof Events, Set<Events[keyof Events]>>()

  on<E extends keyof Events>(event: E, listener: Events[E]): this {
    const set = this.listeners.get(event) ?? new Set<Events[E]>()
    this.listeners.set(event, set)
    set.add(listener)
    return this
  }

  off<E extends keyof Events>(event: E, listener: Events[E]): this {
    this.listeners.get(event)?.delete(listener)
    return this
  }

  emit<E extends keyof Events>(event: E, payload: Parameters<Events[E]>[0]): boolean {
    const listenerSet = this.listeners.get(event)
    listenerSet?.forEach((listener) => {
      listener(payload)
    })

    return true
  }
}
