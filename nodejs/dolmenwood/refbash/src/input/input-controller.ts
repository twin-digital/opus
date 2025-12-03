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

/**
 * Predefined layer priority values.
 */
export const LayerPriority = {
  /**
   * Lowest possible priority.
   */
  Lowest: Number.MAX_SAFE_INTEGER,

  /**
   * Default priority.
   */
  Default: 0,

  /**
   * Priority of screen-wide actions. Generally used to navigate between screens, or between components
   * on the current screen.
   */
  Screen: 10,

  /**
   * Priority of a single component on a screen, such as a section, panel, or other widget.
   */
  Component: 20,

  /**
   * Priority for 'modal' input actions which generally require the user to complete (or cancel) a task
   * before navigating around the screen again.
   */
  Modal: 30,

  /**
   * Highest possible priority.
   */
  Highest: Number.MAX_SAFE_INTEGER,
}

export interface InputLayerOptions {
  /**
   * Whether this layer is 'global' or not. Global layers remain active even when they are not the highest priority
   * layer.
   *
   * @defaultValue false
   */
  global?: boolean

  /**
   * Priority of this layer. At any given time, at most one non-global layer is considered 'active'. This layer will be
   * the one with the highest priority value.
   */
  priority?: number
}

export class InputLayer {
  private _actions: InputActionMapping[] = []

  /**
   * Whether this layer is 'global' or not. Global layers remain active even when they are not the highest priority
   * layer.
   */
  public readonly global

  /**
   * Priority of this layer. At any given time, at most one non-global layer is considered 'active'. This layer will be
   * the one with the highest priority value.
   */
  public readonly priority

  /**
   *
   * @param id Unique ID of this layer.
   * @param global Whether this layer's actions are always available, or only when it is the active (top-most) layer.
   * @param priority Priority for layer ordering. Higher priority layers are processed first. Default: 0.
   */
  public constructor(
    public readonly id: string,
    { global = false, priority = LayerPriority.Default }: InputLayerOptions = {},
  ) {
    this.global = global
    this.priority = priority
  }

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

  /**
   * Removes all previously added actions from this layer.
   */
  public clear() {
    this._actions.splice(0)
  }
}

export class InputController {
  private _layers: Map<string, InputLayer> = new Map<string, InputLayer>()

  public constructor() {
    makeAutoObservable(this)
  }

  /**
   * Uses the specified layer to process the input/key data. Returns true if the layer had a matching action, and
   * false if it did not.
   */
  private async _handleInputWithLayer(layer: InputLayer, inputName: string, key: Key) {
    for (const { action, input } of layer.actions) {
      if (inputMatches(input, inputName, key)) {
        await action()
        return true
      }
    }

    return false
  }

  /**
   * Helper to retrieve hints from a specific layer.
   */
  private _getLayerHints(layer: InputLayer): InputHint[] {
    const hints: InputHint[] = []
    for (const action of layer.actions) {
      if (action.hint) {
        const keyBind = getKeyBindString(action.input)
        hints.push({
          description: action.hint,
          keyBind,
        })
      }
    }
    return hints
  }

  private get _sortedLayers(): InputLayer[] {
    return this._layers
      .values()
      .toArray()
      .sort((a, b) => b.priority - a.priority)
  }

  public get activeActionHints(): readonly InputHint[] {
    if (this._layers.size === 0) {
      return []
    }

    // Active layer is the highest priority non-global layer
    const nonGlobalLayers = this._layers
      .values()
      .toArray()
      .filter((layer) => !layer.global)
      .sort((a, b) => b.priority - a.priority)

    if (nonGlobalLayers.length === 0) {
      return []
    }

    return this._getLayerHints(nonGlobalLayers[0])
  }

  public get globalActionHints(): readonly InputHint[] {
    // Get active layer hints to filter out duplicates
    const activeHints = new Set(this.activeActionHints.map((hint) => hint.keyBind))
    const seen = new Map<string, InputHint>()

    // Collect hints from all global layers in priority order
    const layers = this._sortedLayers
    for (const layer of layers) {
      if (layer.global) {
        for (const hint of this._getLayerHints(layer)) {
          // Suppress global hints that conflict with active layer hints
          if (!activeHints.has(hint.keyBind)) {
            seen.set(hint.keyBind, hint)
          }
        }
      }
    }

    return Array.from(seen.values())
  }

  public async handleInput(inputName: string, key: Key) {
    if (this._layers.size === 0) {
      // edge case of no layers
      return
    }

    // Active layer is the highest priority non-global layer
    const nonGlobalLayers = this._sortedLayers.filter((layer) => !layer.global)
    const globalLayers = this._sortedLayers.filter((layer) => layer.global)

    // Try the active (highest priority non-global) layer first
    if (nonGlobalLayers.length > 0) {
      const activeLayer = nonGlobalLayers[0]
      const handled = await this._handleInputWithLayer(activeLayer, inputName, key)
      if (handled) {
        return
      }
    }

    // Try all global layers in priority order
    for (const layer of globalLayers) {
      const handled = await this._handleInputWithLayer(layer, inputName, key)
      if (handled) {
        return
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
