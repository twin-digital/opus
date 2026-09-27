import * as path from 'node:path'
import { ExtStateStore } from './ext-state.js'

/** An open project: a ReaScript `ReaProject` handle and its state. */
export class SimProject {
  readonly extState = new ExtStateStore()

  /** @param path The `.rpp` file, or empty for an unsaved project. */
  constructor(public path = '') {}

  /** The file name, as `GetProjectName` reports it; empty when unsaved. */
  get name(): string {
    return this.path === '' ? '' : path.basename(this.path)
  }
}
