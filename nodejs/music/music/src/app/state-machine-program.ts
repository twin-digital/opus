import type { Program } from '../engine/program.js'
import type { StateFactory, StateMachine } from './state-machine.js'

/**
 * Creates a `Program` instance which wraps a state machine and forwards lifecycle events to it as needed. The program
 * will display the state machine's UI root as its own.
 */
export const createStateMachineProgram = <TContext, TFactories extends StateFactory<TContext>>(
  stateMachine: StateMachine<TContext, TFactories>,
): Program => {
  return {
    getDrawable: () => stateMachine.getDrawable(),
    initialize: () => {
      stateMachine.initialize()
    },
    shutdown: () => {
      stateMachine.shutdown()
    },
    update: (elapsedSeconds: number) => {
      stateMachine.update(elapsedSeconds)
    },
  }
}
