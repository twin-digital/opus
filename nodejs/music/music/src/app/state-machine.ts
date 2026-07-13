import { cloneDeep } from 'lodash-es'
import { group } from '../ui/components/group.js'
import type { Drawable } from '../ui/drawable.js'
import { SimpleEntityManager, type EntityManager } from '../engine/entity.js'

/**
 * Represents a single state in a StateMachine.
 */
export interface State {
  /**
   * Callback invoked when this state is entered.
   */
  enter?(entityManager: EntityManager): void

  /**
   * Callback invoked when this state is exited.
   */
  exit?(): void

  /**
   * If this state has a visual component, return the corresponding drawable.
   */
  getDrawable?(): Drawable

  /**
   * Returns the final result code for the state. It is an error to call this method if `isDone()` !== `true`.
   */
  getResult(): string

  /**
   * Returns a flag indicating if this state has compelted or not.
   */
  isDone(): boolean

  /**
   * Name of this state, for debugging purposes.
   */
  stateName: string

  /**
   * Called periodically when the application performs updates.
   * @param elapsedSeconds Amount of time, in (possibly fractional) seconds, since the last call to `tick`.
   */
  update?(elapsedSeconds: number): void
}

/**
 * Factory for State instances, created with the context from a specific StateMachine.
 */
export type StateFactory<TContext> = (ctx: TContext) => State

/**
 * Given a state constructor type, determine the list of results that state can generate.
 */
type RawResultOf<T extends StateFactory<TContext>, TContext> =
  ReturnType<T> extends { getResult(): infer R } ?
    R extends string ?
      R
    : never
  : never

/**
 * Type helper that converts the wide type `string` to `never`, allowing us to enforce that an inferred type is
 * narrowed as expected.
 */
type EnforceNotString<T> = string extends T ? never : T

/**
 * Attempts to lookup the result types for a ProgramState constructor. Will resovle the result type string
 * union if possible. If the class was not built with a properly narrowed result type, an error is resolved instead.
 * In this case, try adding a specific type annotation to `getResult`, or annotating the return value `as const`.
 */
type ResultOf<T extends StateFactory<TContext>, TContext> = EnforceNotString<RawResultOf<T, TContext>>

/**
 * Given TStates, a union of `StateFactory` instances = (...) => ... | (...) => ... | ..., and a literal name K = "foo" |
 * "bleh" | ..., this helper finds the one factory in T whose product's `stateName` is K.
 */
// type StateConstructorByName<
//   States extends StateFactory<unknown>,
//   K extends InstanceType<States>['stateName'],
// > = Extract<States, new () => { stateName: K }>

type FactoryByName<
  TStates extends StateFactory<TContext>,
  TContext,
  K extends ReturnType<TStates>['stateName'],
> = Extract<TStates, (ctx: TContext) => { stateName: K }>

/**
 * For a union of factories `AllFactories`, and a specific key `K` in the union
 * (i.e. the literal stateName), extract just that one factory whose returned
 * .stateName === K, and then infer its ResultOfFactory. If that was `never`
 * (because getResult() widened), produce the ERROR string; otherwise build a
 * Record< thoseResultLiterals, AllFactories >.
 */
export type StateTransitionsFor<
  TAllFactories extends StateFactory<TContext>,
  TContext,
  K extends ReturnType<TAllFactories>['stateName'],
> =
  ResultOf<FactoryByName<TAllFactories, TContext, K>, TContext> extends never ?
    'ERROR: getResult() returned plain string—annotate or use `as const`.'
  : Record<ResultOf<FactoryByName<TAllFactories, TContext, K>, TContext>, TAllFactories>

/**
 * Build the full transition map type over every stateName K ∈ StateNameOf<AllFactories>.
 * Each entry must either be the ERROR string (if that factory’s getResult())
 * wasn’t properly narrowed, or else a Record< resultLiterals, AllFactories >.
 */
export type AllTransitionsForFactory<AllFactories extends StateFactory<TContext>, TContext> = {
  [K in ReturnType<AllFactories>['stateName']]: StateTransitionsFor<AllFactories, TContext, K>
}

export interface StateMachineContext {
  /**
   * EntityManager which can be used to regsiter entities. When the current state is 'exited', all registerd entities
   * will be cleared automatically.
   */
  entityManager: EntityManager
}

export class StateMachine<TContext, TAllFactories extends StateFactory<TContext>> {
  private context: TContext
  private entityManager = new SimpleEntityManager()
  private initialized = false
  private state: ReturnType<TAllFactories>

  public constructor(
    initialContext: TContext,
    createInitialState: TAllFactories,
    private transitions: AllTransitionsForFactory<TAllFactories, TContext>,
  ) {
    this.context = cloneDeep(initialContext)
    this.state = createInitialState(this.context) as ReturnType<TAllFactories>
  }

  /**
   * Advances to the next state, if the current one is done. We split into two steps: (A) extract name + rawResult + do
   * one small cast, then (B) call the generic helper `advanceFor<K>` which “locks in” the literal types.
   */
  private maybeAdvanceToNextState(): void {
    if (!this.state.isDone()) {
      return
    }

    const name = this.state.stateName as ReturnType<TAllFactories>['stateName']
    const result = this.state.getResult() as keyof StateTransitionsFor<TAllFactories, TContext, typeof name>

    const createNextState = this.transitions[name][result] as TAllFactories

    // exit old state
    console.log(`Exiting: ${this.state.stateName}`)
    this.state.exit?.()
    this.entityManager.clear()
    // create next state
    this.state = createNextState(this.context) as ReturnType<TAllFactories>
    // enter new state
    console.log(`Entering: ${this.state.stateName}`)
    this.state.enter?.(this.entityManager)
  }

  public getDrawable(): Drawable {
    return group(this.entityManager.getDrawable(), this.state.getDrawable?.() ?? group())
  }

  public initialize(): void {
    this.initialized = true

    // enter our initial state
    this.state.enter?.(this.entityManager)
  }

  shutdown(): void {
    // never entered (or already shut down): there is no current state to exit
    if (!this.initialized) {
      return
    }
    this.initialized = false

    // exit our current state
    this.state.exit?.()
  }

  update(elapsedSeconds: number): void {
    // the current state hasn't been entered until initialize() — advancing before that runs
    // transitions against un-entered states (e.g. a challenge that was never created) and
    // can wedge the machine permanently
    if (!this.initialized) {
      return
    }

    this.entityManager.update(elapsedSeconds)
    this.state.update?.(elapsedSeconds)
    this.maybeAdvanceToNextState()
  }
}
