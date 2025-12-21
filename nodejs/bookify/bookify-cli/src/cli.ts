import type { Command } from '@oclif/core'
import Pdf from './cli/pdf.js'
import Html from './cli/html.js'
import Serve from './cli/serve.js'

export const Commands: Record<string, typeof Command> = {
  html: Html,
  pdf: Pdf,
  serve: Serve,
}
