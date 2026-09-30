import { LuaMultiReturn } from 'wasmoon'
import type { ReaperModel } from './model.js'
import { SimProject } from './project.js'
import { isTrackValue, SimTrack, trackValueProperty } from './track.js'

export interface ReaScriptContext {
  model: ReaperModel
  /**
   * Queues a Lua function for the next tick.
   */
  defer(fn: () => unknown): void
  /**
   * Registers a Lua function to run when the script ends.
   */
  atexit(fn: () => unknown): void
  /**
   * Names of the files directly inside a directory, sorted.
   */
  listFiles(directory: string): string[]
  /**
   * Seconds, as `time_precise` reports them.
   */
  now(): number
  console: { text: string }
  /**
   * Records each call, for the simulator's journal.
   */
  record(fn: string, args: unknown[]): void
}

const multi = (...values: unknown[]) => LuaMultiReturn.from(values)

/**
 * The `reaper` table a script sees: the ReaScript functions the simulator implements.
 */
type ReaScriptApi = Record<string, (...args: never[]) => unknown>

export const createReaScriptApi = (context: ReaScriptContext): ReaScriptApi => {
  const { model } = context

  const project = (proj: unknown): SimProject => {
    if (proj instanceof SimProject) {
      return proj
    }
    if (proj === 0 || proj === undefined || proj === null) {
      return model.currentProject
    }
    throw new Error(`Invalid ReaProject: ${typeof proj}`)
  }

  const track = (handle: unknown): SimTrack => {
    if (handle instanceof SimTrack) {
      return handle
    }
    throw new Error(`Invalid MediaTrack: ${typeof handle}`)
  }

  const trackValue = (parameter: string) => {
    if (!isTrackValue(parameter)) {
      throw new Error(`Unsupported track parameter: ${parameter}`)
    }
    return trackValueProperty(parameter)
  }

  let undoDepth = 0

  const api: ReaScriptApi = {
    defer: (fn: () => unknown) => {
      context.defer(fn)
      return true
    },
    atexit: (fn: () => unknown) => {
      context.atexit(fn)
    },
    time_precise: () => context.now(),
    EnumerateFiles: (directory: string, idx: number) =>
      multi(context.listFiles(directory).at(idx < 0 ? Infinity : idx)),
    ShowConsoleMsg: (msg: string) => {
      context.console.text += msg
    },
    ClearConsole: () => {
      context.console.text = ''
    },

    EnumProjects: (idx: number) => {
      const p =
        idx === -1 ? model.currentProject
        : idx >= 0 ? model.projects.at(idx)
        : undefined
      return p === undefined ? multi(undefined, '') : multi(p, p.path)
    },
    GetProjectName: (proj: unknown) => project(proj).name,
    GetNumAudioInputs: () => model.audioInputs.length,
    GetInputChannelName: (channel: number) => multi(model.audioInputs[channel]),
    Main_openProject: (name: string) => {
      model.openProjectInTab(name.replace(/^noprompt:/, ''))
    },
    // saving writes nothing: project files aren't modeled
    Main_SaveProjectEx: (proj: unknown, _filename: string, _options: number) => {
      project(proj)
    },
    CountTracks: (proj: unknown) => project(proj).tracks.length,
    GetTrack: (proj: unknown, index: number) => multi(project(proj).tracks.at(index < 0 ? Infinity : index)),
    InsertTrackAtIndex: (index: number, _wantDefaults: boolean) => {
      const { tracks } = model.currentProject
      tracks.splice(Math.max(0, Math.min(index, tracks.length)), 0, new SimTrack())
    },
    DeleteTrack: (handle: unknown) => {
      for (const { tracks } of model.projects) {
        const index = tracks.indexOf(track(handle))
        if (index >= 0) {
          tracks.splice(index, 1)
        }
      }
    },
    GetTrackGUID: (handle: unknown) => track(handle).guid,
    GetSetMediaTrackInfo_String: (handle: unknown, parameter: string, value: string, set: boolean) => {
      if (parameter !== 'P_NAME') {
        throw new Error(`Unsupported track parameter: ${parameter}`)
      }
      if (set) {
        track(handle).name = value
      }
      return multi(true, track(handle).name)
    },
    GetMediaTrackInfo_Value: (handle: unknown, parameter: string) => track(handle)[trackValue(parameter)],
    SetMediaTrackInfo_Value: (handle: unknown, parameter: string, value: number) => {
      track(handle)[trackValue(parameter)] = value
      return true
    },
    GetNumMIDIInputs: () => model.midiInputs.length,
    GetMIDIInputName: (device: number) => {
      const input = model.midiInputs[device]
      return input === undefined ? multi(false, '') : multi(input.present, input.name)
    },
    Undo_BeginBlock2: (proj: unknown) => {
      project(proj)
      undoDepth += 1
    },
    Undo_EndBlock2: (proj: unknown, description: string, _flags: number) => {
      project(proj)
      undoDepth -= 1
      if (undoDepth === 0) {
        model.undoPoints.push(description)
      }
    },
    PreventUIRefresh: (_change: number) => undefined,
    // change tracking isn't modeled
    IsProjectDirty: (proj: unknown) => {
      project(proj)
      return 0
    },

    GetProjExtState: (proj: unknown, extname: string, key: string) => {
      const value = project(proj).extState.get(extname, key) ?? ''
      return multi(value.length, value)
    },
    SetProjExtState: (proj: unknown, extname: string, key: string, value: string) => {
      const { extState } = project(proj)
      if (key === '') {
        extState.deleteSection(extname)
      } else {
        extState.set(extname, key, value)
      }
      return 1
    },
    EnumProjExtState: (proj: unknown, extname: string, idx: number) => {
      const entry = project(proj).extState.entries(extname).at(idx)
      return entry === undefined ? multi(false) : multi(true, ...entry)
    },

    GetExtState: (section: string, key: string) => model.globalExtState.get(section, key) ?? '',
    SetExtState: (section: string, key: string, value: string, _persist: boolean) => {
      model.globalExtState.set(section, key, value)
    },
    DeleteExtState: (section: string, key: string, _persist: boolean) => {
      model.globalExtState.delete(section, key)
    },
    HasExtState: (section: string, key: string) => model.globalExtState.get(section, key) !== undefined,
  }

  return Object.fromEntries(
    Object.entries(api).map(([name, fn]) => [
      name,
      (...args: never[]) => {
        context.record(name, args)
        return fn(...args)
      },
    ]),
  )
}
