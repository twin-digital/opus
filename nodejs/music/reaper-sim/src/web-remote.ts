import type { ReaperModel } from './model.js'

export interface WebRemoteReply {
  status: number
  body: string
}

/**
 * Escapes a reply field the way the web remote's `simple_unescape` expects.
 */
const escape = (value: string) => value.replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\n/g, '\\n')

/**
 * REAPER cuts each command off at this many characters, as sent (URL-encoded), and answers as usual.
 */
export const COMMAND_LIMIT = 1023

/**
 * Decodes percent-escapes as UTF-8 bytes; an escape or byte sequence cut short decodes to a replacement character.
 */
const decode = (text: string) =>
  Buffer.concat(
    text
      .split(/(%[0-9A-Fa-f]{2})/)
      .map((part) => (/^%[0-9A-Fa-f]{2}$/.test(part) ? Buffer.from([parseInt(part.slice(1), 16)]) : Buffer.from(part))),
  ).toString('utf8')

class UnsupportedCommand extends Error {}

const runCommand = (model: ReaperModel, parts: string[]): string | undefined => {
  const [verb = '', kind = '', rawSection = '', rawKey = ''] = parts
  const value = () => decode(parts.slice(4).join('/'))

  // SET decodes the section and key; GET looks them up, and echoes them, as sent
  switch (`${verb}/${kind}`) {
    case 'GET/PROJEXTSTATE':
      return `PROJEXTSTATE\t${rawSection}\t${rawKey}\t${escape(model.currentProject.extState.get(rawSection, rawKey) ?? '')}`
    case 'SET/PROJEXTSTATE':
      model.currentProject.extState.set(decode(rawSection), decode(rawKey), value())
      return undefined
    case 'GET/EXTSTATE':
      return `EXTSTATE\t${rawSection}\t${rawKey}\t${escape(model.globalExtState.get(rawSection, rawKey) ?? '')}`
    case 'SET/EXTSTATE':
    case 'SET/EXTSTATEPERSIST':
      model.globalExtState.set(decode(rawSection), decode(rawKey), value())
      return undefined
    default:
      throw new UnsupportedCommand(`Unsupported web remote command: ${parts.join('/')}`)
  }
}

/**
 * Answers a web remote request path (`/_/<cmd>;<cmd>;...`), applying the commands in order.
 * Commands the simulator doesn't implement fail the request with 501, where REAPER ignores them.
 */
export const handleWebRemote = (model: ReaperModel, requestPath: string, log: string[]): WebRemoteReply => {
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
