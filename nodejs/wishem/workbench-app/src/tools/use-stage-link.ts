import type { ConstructEntry } from '@thrashplay/wishem-construct-manager'
import { connectLink } from '@thrashplay/wishem-hub'
import type { PortReader } from '@thrashplay/wishem-renderer-react'
import { useEffect, useState } from 'react'

export type StageState =
  | { state: 'off' }
  | { state: 'connecting' }
  | { state: 'connected'; port: PortReader }
  | { state: 'down'; port: PortReader | undefined }

interface Link {
  key: string
  state: 'connected' | 'down'
  port: PortReader | undefined
}

const stageUrl = (id: string) =>
  `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/constructs/${id}/link`

/** Opens the stage link while the entry runs. A new `link` or `startSeq` opens a new link. */
export const useStageLink = (id: string, entry: ConstructEntry | undefined): StageState => {
  const key = entry?.status === 'running' && entry.link !== undefined ? `${entry.link}|${entry.startSeq}` : undefined
  const [link, setLink] = useState<Link>()

  useEffect(() => {
    if (key === undefined) {
      return
    }
    const client = connectLink({
      url: stageUrl(id),
      createSocket: (address) => new WebSocket(address),
      subsystems: [{ prefix: 'page', suffix: '-stage', kind: 'output' }],
      onLink: ([port]) => {
        setLink({ key, state: 'connected', port })
      },
      onDown: () => {
        setLink((previous) => ({ key, state: 'down', port: previous?.key === key ? previous.port : undefined }))
      },
      onError: (cause) => {
        console.error('wishem: a listener of the stage link failed.', cause)
      },
    })
    return () => {
      client.close()
    }
  }, [id, key])

  if (key === undefined) {
    return { state: 'off' }
  }
  if (link?.key !== key) {
    return { state: 'connecting' }
  }
  return link.state === 'connected' && link.port ?
      { state: 'connected', port: link.port }
    : { state: 'down', port: link.port }
}
