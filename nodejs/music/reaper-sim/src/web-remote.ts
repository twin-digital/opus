import type { ReaperModel } from './model.js'

export interface WebRemoteReply {
  status: number
  body: string
}

/** Escapes a reply field the way the web remote's `simple_unescape` expects. */
const escape = (value: string) => value.replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\n/g, '\\n')

/** REAPER cuts each command off at this many characters, as sent (URL-encoded), and answers as usual. */
export const COMMAND_LIMIT = 1023

/** Decodes percent-escapes as UTF-8 bytes; an escape or byte sequence cut short decodes to a replacement character. */
const decode = (text: string) =>
  Buffer.concat(
    text
      .split(/(%[0-9A-Fa-f]{2})/)
      .map((part) => (/^%[0-9A-Fa-f]{2}$/.test(part) ? Buffer.from([parseInt(part.slice(1), 16)]) : Buffer.from(part))),
  ).toString('utf8')

class UnsupportedCommand extends Error {}

/**
 * Answers a web remote request path (`/_/<cmd>;<cmd>;...`), applying the commands in order.
 * Commands the simulator doesn't implement fail the request with 501, where REAPER ignores them.
 */
export function handleWebRemote(model: ReaperModel, requestPath: string, log: string[]): WebRemoteReply {
  if (!requestPath.startsWith('/_/')) {
    return { status: 404, body: 'Not found' }
  }
  const lines: string[] = []
  try {
    for (const command of requestPath.slice(3).split(';')) {
      if (command === '') {
        continue
      }
      log.push(command)
      const line = runCommand(model, command.slice(0, COMMAND_LIMIT).split('/'))
      if (line !== undefined) {
        lines.push(line)
      }
    }
  } catch (error) {
    if (error instanceof UnsupportedCommand) {
      return { status: 501, body: error.message }
    }
    throw error
  }
  return { status: 200, body: lines.map((line) => `${line}\n`).join('') }
}

function runCommand(model: ReaperModel, parts: string[]): string | undefined {
  const [verb = '', kind = '', rawSection = '', rawKey = ''] = parts
  const section = decode(rawSection)
  const key = decode(rawKey)
  const value = () => decode(parts.slice(4).join('/'))

  switch (`${verb}/${kind}`) {
    case 'GET/PROJEXTSTATE':
      return `PROJEXTSTATE\t${section}\t${key}\t${escape(model.currentProject.extState.find(section, key) ?? '')}`
    case 'SET/PROJEXTSTATE':
      model.currentProject.extState.set(section.toUpperCase(), key.toUpperCase(), value())
      return undefined
    case 'GET/EXTSTATE':
      return `EXTSTATE\t${section}\t${key}\t${escape(model.globalExtState.find(section, key) ?? '')}`
    case 'SET/EXTSTATE':
    case 'SET/EXTSTATEPERSIST':
      model.globalExtState.set(section.toUpperCase(), key.toUpperCase(), value())
      return undefined
    default:
      throw new UnsupportedCommand(`Unsupported web remote command: ${parts.join('/')}`)
  }
}
