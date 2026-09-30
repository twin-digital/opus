import * as path from 'node:path'
import { ExtStateStore } from './ext-state.js'
import type { SimTrack } from './track.js'

/**
 * A project tab: a ReaScript `ReaProject` handle and the project open in it.
 */
export class SimProject {
  readonly extState = new ExtStateStore(true)
  readonly tracks: SimTrack[] = []

  /**
   * @param path The `.rpp` file, or empty for an unsaved project.
   */
  constructor(public path = '') {}

  /**
   * The file name, as `GetProjectName` reports it; empty when unsaved.
   */
  get name(): string {
    return this.path === '' ? '' : path.basename(this.path)
  }

  /**
   * Replaces the project in this tab; the handle stays the same, as it does in REAPER.
   */
  open(path: string): void {
    this.path = path
    this.extState.clear()
    this.tracks.length = 0
  }
}
