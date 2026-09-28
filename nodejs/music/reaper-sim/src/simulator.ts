import { readFile, readdir } from 'node:fs/promises'
import * as http from 'node:http'
import type { AddressInfo } from 'node:net'
import * as path from 'node:path'
import { LuaFactory, type LuaEngine } from 'wasmoon'
import { ReaperModel } from './model.js'
import { createReaScriptApi } from './reascript-api.js'
import { handleWebRemote } from './web-remote.js'

export interface ReaperSimOptions {
  /**
   * Seconds for `time_precise`; defaults to a monotonic clock.
   */
  clock?: () => number
}

/**
 * A ReaScript call a script made.
 */
export interface ReaScriptCall {
  script: string
  fn: string
  args: unknown[]
}

/**
 * A Lua script the simulator hosts, each in its own Lua state as REAPER runs them.
 */
export class SimScript {
  /**
   * The error that stopped the script, if one did.
   */
  error: unknown = undefined

  constructor(
    readonly name: string,
    readonly engine: LuaEngine,
  ) {}

  closed = false

  /**
   * Functions registered with `atexit`, run when the script ends.
   */
  readonly atexit: (() => unknown)[] = []

  get running(): boolean {
    return !this.closed
  }
}

/**
 * An in-memory REAPER: hosts ReaScript Lua scripts against a model of REAPER's state, and serves
 * the web remote against the same state. Everything runs on one thread, as REAPER runs scripts and
 * web remote requests on its main thread, so each tick and each request is atomic.
 */
export class ReaperSim {
  readonly model = new ReaperModel()
  /**
   * The ReaScript console, as `ShowConsoleMsg` writes it.
   */
  readonly console = { text: '' }
  /**
   * Every ReaScript call, in order.
   */
  readonly calls: ReaScriptCall[] = []
  /**
   * Every web remote command, in order.
   */
  readonly webRequests: string[] = []

  private readonly factory = new LuaFactory()
  private readonly files = new Map<string, string>()
  private readonly clock: () => number
  private readonly scripts: SimScript[] = []
  private deferred: { script: SimScript; fn: () => unknown }[] = []
  private readonly servers: http.Server[] = []

  constructor({ clock = () => performance.now() / 1000 }: ReaperSimOptions = {}) {
    this.clock = clock
  }

  /**
   * Runs a Lua script's main chunk; its deferred functions run on later ticks.
   */
  async loadScript(source: string, { name = 'script' }: { name?: string } = {}): Promise<SimScript> {
    return this.start(name, (engine) => engine.doString(source))
  }

  /**
   * Runs a script from disk, as REAPER runs an installed one. The script's directory is mounted
   * first, so it can `loadfile` its siblings by the path it finds in `debug.getinfo`.
   */
  async loadScriptFile(file: string): Promise<SimScript> {
    const absolute = path.resolve(file)
    await this.mountDirectory(path.dirname(absolute))
    return this.start(path.basename(absolute), (engine) => engine.doFile(absolute))
  }

  /**
   * Makes a file visible to scripts at a path, alongside any mounted from disk.
   */
  async mountFile(file: string, content: string): Promise<void> {
    await this.factory.mountFile(file, content)
    this.files.set(path.posix.normalize(file), content)
  }

  /**
   * Mounts a directory from disk, recursively, at the same path or another.
   */
  async mountDirectory(directory: string, at = directory): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const source = path.join(directory, entry.name)
      const target = path.posix.join(at, entry.name)
      if (entry.isDirectory()) {
        await this.mountDirectory(source, target)
      } else if (entry.isFile()) {
        await this.mountFile(target, await readFile(source, 'utf8'))
      }
    }
  }

  /**
   * Ends a script as a user does from REAPER's toolbar: its `atexit` functions run.
   */
  stopScript(script: SimScript): void {
    this.finish(script)
  }

  /**
   * Runs every function deferred before this tick; ones they defer wait for the next. A script that
   * throws is stopped, and the tick rethrows its error once the other scripts have run.
   */
  tick(): void {
    const due = this.deferred
    this.deferred = []
    let failure: { error: unknown } | undefined
    for (const { script, fn } of due) {
      if (!script.running) {
        continue
      }
      try {
        fn()
      } catch (error) {
        this.stop(script, error)
        failure ??= { error }
      }
    }
    this.finishIdle()
    if (failure !== undefined) {
      throw failure.error
    }
  }

  /**
   * Ticks on a timer, as REAPER's main loop does (about 30 Hz); returns a function that stops it.
   */
  run(intervalMs = 33): () => void {
    const timer = setInterval(() => {
      try {
        this.tick()
      } catch {
        // the failed script is stopped and holds its error
      }
    }, intervalMs)
    return () => {
      clearInterval(timer)
    }
  }

  /**
   * The web remote as a fetch function.
   */
  readonly fetch = (input: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : input, 'http://reaper.sim')
    const reply = handleWebRemote(this.model, url.pathname, this.webRequests)
    return Promise.resolve(new Response(reply.body, { status: reply.status }))
  }

  /**
   * Serves the web remote over HTTP; resolves to its base URL.
   */
  async listen({ port = 0, host = '127.0.0.1' }: { port?: number; host?: string } = {}): Promise<string> {
    const server = http.createServer((req, res) => {
      const reply = handleWebRemote(this.model, new URL(req.url ?? '/', 'http://reaper.sim').pathname, this.webRequests)
      res.writeHead(reply.status, { 'content-type': 'text/plain; charset=utf-8' })
      res.end(reply.body)
    })
    this.servers.push(server)
    await new Promise<void>((resolve) => server.listen(port, host, resolve))
    return `http://${host}:${String((server.address() as AddressInfo).port)}`
  }

  /**
   * Ends every script, as quitting REAPER does, and stops every HTTP server.
   */
  async close(): Promise<void> {
    for (const script of this.scripts) {
      this.finish(script)
    }
    await Promise.all(this.servers.map((server) => new Promise((resolve) => server.close(resolve))))
  }

  private async start(name: string, run: (engine: LuaEngine) => Promise<unknown>): Promise<SimScript> {
    const engine = await this.factory.createEngine()
    const script = new SimScript(name, engine)
    this.scripts.push(script)
    engine.global.set(
      'reaper',
      createReaScriptApi({
        model: this.model,
        console: this.console,
        now: this.clock,
        defer: (fn) => this.deferred.push({ script, fn }),
        atexit: (fn) => script.atexit.push(fn),
        listFiles: (directory) => this.listFiles(directory),
        record: (fn, args) => this.calls.push({ script: name, fn, args }),
      }),
    )
    try {
      await run(engine)
    } catch (error) {
      this.stop(script, error)
      throw error
    }
    this.finishIdle()
    return script
  }

  private listFiles(directory: string): string[] {
    const dir = path.posix.normalize(directory).replace(/\/+$/, '')
    return [...this.files.keys()]
      .filter((file) => path.posix.dirname(file) === dir)
      .map((file) => path.posix.basename(file))
      .sort()
  }

  /**
   * Ends scripts with nothing deferred, as REAPER does once a script's main chunk and deferred
   * functions have all returned.
   */
  private finishIdle(): void {
    for (const script of this.scripts) {
      if (script.running && !this.deferred.some((entry) => entry.script === script)) {
        this.finish(script)
      }
    }
  }

  /**
   * Ends a script normally: its `atexit` functions run, then its Lua state closes.
   */
  private finish(script: SimScript): void {
    if (script.closed) {
      return
    }
    for (const fn of script.atexit) {
      try {
        fn()
      } catch (error) {
        script.error ??= error
      }
    }
    this.stop(script, script.error)
  }

  /**
   * Ends a script without running its `atexit` functions, as an error does.
   */
  private stop(script: SimScript, error?: unknown): void {
    if (script.closed) {
      return
    }
    script.error = error
    script.closed = true
    this.deferred = this.deferred.filter((entry) => entry.script !== script)
    script.engine.global.close()
  }
}
