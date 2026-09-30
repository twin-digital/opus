import { LuaMultiReturn } from 'wasmoon'
import type { ReaperModel } from './model.js'
import { SimProject } from './project.js'

export interface ReaScriptContext {
  model: ReaperModel
  /**
   * Queues a Lua function for the next tick.
   */
  defer(fn: () => unknown): void
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

export function createReaScriptApi(context: ReaScriptContext): ReaScriptApi {
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

  const api: ReaScriptApi = {
    defer: (fn: () => unknown) => {
      context.defer(fn)
      return true
    },
    time_precise: () => context.now(),
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
