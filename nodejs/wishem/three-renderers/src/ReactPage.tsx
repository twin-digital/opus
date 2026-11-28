import type { WebSocketLike } from '@thrashplay/wishem-hub'
import { connectLink } from '@thrashplay/wishem-hub'
import type { Port } from '@thrashplay/wishem-hub'
import { Renderer } from '@thrashplay/wishem-renderer-react'
import type { ViewTable } from '@thrashplay/wishem-renderer-react'
import { useEffect, useState } from 'react'
import { statusText } from './status.js'
import type { LinkStatus } from './status.js'

export interface ReactPageProps {
  /** For example `ws://127.0.0.1:5175/link`. */
  url: string
  createSocket: (url: string) => WebSocketLike
  views: ViewTable
  /** Default 500. */
  firstDelayMs?: number
  /** Default 5000. */
  maxDelayMs?: number
}

interface PageState {
  status: LinkStatus
  /** The port of the latest link. It stays while the link is down. */
  port: Port | undefined
}

/** Draws the sample construct from one output port of the link, with a status line. The page sends no input. */
export const ReactPage = ({ url, createSocket, views, firstDelayMs, maxDelayMs }: ReactPageProps) => {
  const [state, setState] = useState<PageState>({ status: { state: 'connecting' }, port: undefined })

  useEffect(() => {
    let link = 0
    const client = connectLink({
      url,
      createSocket,
      firstDelayMs,
      maxDelayMs,
      subsystems: [{ prefix: 'react-page', kind: 'output' }],
      onLink: ([port]) => {
        link += 1
        setState({ status: { state: 'connected', link }, port })
      },
      onDown: () => {
        setState((current) => ({ ...current, status: { state: 'down', link } }))
      },
      onRefused: (error) => {
        console.error(`wishem: the hub refused the link (${error.reason}). ${error.message}`)
      },
      onError: (error) => {
        console.error('wishem: a listener of the link failed.', error)
      },
    })
    return () => {
      client.close()
    }
  }, [url, createSocket, firstDelayMs, maxDelayMs])

  return (
    <>
      <div id='box' role='img' aria-label='The color of the construct'>
        {state.port && <Renderer port={state.port} views={views} />}
      </div>
      <p id='status' role='status'>
        {statusText(state.status)}
      </p>
    </>
  )
}
