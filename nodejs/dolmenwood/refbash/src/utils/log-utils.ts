import fs from 'node:fs'

export const patchConsoleToLog = (logFile: string) => {
  console.log = (...args: unknown[]) => {
    const msg = args.map(String).join(' ')
    fs.appendFileSync(logFile, `${msg}\n`, 'utf-8')
  }
}
