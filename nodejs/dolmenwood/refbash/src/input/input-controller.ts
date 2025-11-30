import type { Key } from 'ink'
import { getKeyBindString, inputMatches, type InputMatcher } from './input-matcher.js'
import { makeAutoObservable } from 'mobx'

export type InputActionFn = () => void | Promise<void>

/**
 * Maps action functions to matchers against incoming input events.
 */
export interface InputActionMapping {
  /**
   * Action to invoke when matching input is received.
   */
  action: InputActionFn

  /**
   * Help text or 'hint' to display to the user for this action. If not specified, this action will not be registered
   * with the help UI.
   */
  hint?: string

  /**
   * Matcher used to determine if an input event should trigger this action or not.
   */
  input: InputMatcher
}

export interface InputHint {
  description: string
  keyBind: string
}

export class InputLayer {
  private _actions: InputActionMapping[] = []

  public constructor(public readonly id: string) {}

  public get actions(): readonly InputActionMapping[] {
    return this._actions
  }

  /**
   * Adds an action to this layer.
   */
  public addAction(input: InputMatcher, handler: InputActionFn, hint?: string): void {
    this._actions.push({
      action: handler,
      hint,
      input,
    })
  }
}

export class InputController {
  private _layers: Map<string, InputLayer> = new Map<string, InputLayer>()

  public constructor() {
    makeAutoObservable(this)
  }

  public get hints(): readonly InputHint[] {
    const seen = new Map<string, InputHint>()

    // Iterate through actions, keeping last hint for each keyBind
    for (const layer of this._layers.values()) {
      for (const action of layer.actions) {
        if (action.hint) {
          const keyBind = getKeyBindString(action.input)
          seen.set(keyBind, {
            description: action.hint,
            keyBind,
          })
        }
      }
    }
    return Array.from(seen.values())
  }

  public async handleInput(inputName: string, key: Key) {
    const layers = this._layers.values().toArray().reverse()
    for (const layer of layers) {
      for (const { action, input } of layer.actions) {
        if (inputMatches(input, inputName, key)) {
          await action()
          return
        }
      }
    }
  }

  public register(layer: InputLayer): void {
    this._layers.set(layer.id, layer)
  }

  public remove(layerId: string): void {
    this._layers.delete(layerId)
  }
}
