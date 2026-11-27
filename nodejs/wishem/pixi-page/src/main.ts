import { Application } from 'pixi.js'
import { connectLink } from '@thrashplay/wishem-hub'
import { startPage } from './page.js'
import { statusText } from './status.js'

const WIDTH = 640
const HEIGHT = 360

const linkUrl = () => `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/link`

const run = async (): Promise<void> => {
  const screen = document.getElementById('screen')
  const statusLine = document.getElementById('status')
  if (!screen || !statusLine) {
    throw new Error('The page has no element for the canvas or the status line.')
  }

  const app = new Application()
  await app.init({ width: WIDTH, height: HEIGHT })
  app.canvas.setAttribute('role', 'img')
  app.canvas.setAttribute('aria-label', 'The color of the construct')
  screen.appendChild(app.canvas)

  startPage({
    stage: app.stage,
    viewport: { width: WIDTH, height: HEIGHT },
    keys: window,
    connect: (handlers) =>
      connectLink({
        url: linkUrl(),
        createSocket: (address) => new WebSocket(address),
        subsystems: [
          { prefix: 'pixi-screen', kind: 'output' },
          { prefix: 'pixi-keys', kind: 'input' },
        ],
        onLink: (ports) => {
          handlers.onLink(ports)
        },
        onDown: () => {
          handlers.onDown()
        },
        onRefused: (error) => {
          console.error(`wishem: the hub refused the link (${error.reason}). ${error.message}`)
        },
        onError: (error) => {
          console.error('wishem: a listener of the link failed.', error)
        },
      }),
    onStatus: (status) => {
      statusLine.textContent = statusText(status)
    },
  })
  app.canvas.setAttribute('data-ready', 'true')
}

void run()
