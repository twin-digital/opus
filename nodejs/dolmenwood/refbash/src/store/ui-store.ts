import { makeAutoObservable } from 'mobx'
import { InputController } from '../input/input-controller.js'
import { Colors, type Theme } from '../theme/colors.js'

export class UiStore {
  private _input: InputController = new InputController()
  private _theme: Theme = Colors

  public constructor() {
    makeAutoObservable(this)
  }

  public get input(): InputController {
    return this._input
  }

  public get theme(): Theme {
    return this._theme
  }
}
