import fs from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import path from 'node:path'
import { Server } from 'node:http'
import express, { type Express, type Request, type Response } from 'express'

export interface OutputConfig {
  serveHtml: boolean
  servePdf: boolean
  htmlPath?: string
  pdfPath?: string
}

/**
 * Manages the HTTP server, SSE connections, and content serving for live preview.
 */
export class PreviewServer {
  private pdfContent: Buffer | null = null
  private sseClients: Response[] = []
  private httpServer: Server | null = null

  constructor(
    private readonly port: number,
    private readonly config: OutputConfig,
    private readonly log: (msg: string) => void,
  ) {}

  async start(): Promise<void> {
    const app = this.createExpressApp()

    await new Promise<void>((resolve) => {
      // Bind explicitly to IPv4 127.0.0.1 for reliable localhost access in dev containers
      this.httpServer = app.listen(this.port, () => {
        this.log(`Server running at http://127.0.0.1:${this.port}`)
        if (this.config.serveHtml) {
          this.log(`  HTML: http://127.0.0.1:${this.port}/html`)
        }

        if (this.config.servePdf) {
          this.log(`  PDF: http://127.0.0.1:${this.port}/pdf`)
        }

        resolve()
      })
    })
  }

  async loadContent(): Promise<void> {
    const tasks: Promise<void>[] = []

    if (this.config.pdfPath) {
      tasks.push(
        fs.readFile(this.config.pdfPath).then((content) => {
          this.pdfContent = content
        }),
      )
    }

    await Promise.all(tasks)
    this.notifyClients()
  }

  stop(): Promise<void> {
    // Close all SSE connections
    for (const client of this.sseClients) {
      client.end()
    }
    this.sseClients = []

    return new Promise<void>((resolve) => {
      if (this.httpServer) {
        this.httpServer.close(() => {
          this.log('Server closed')
          resolve()
        })
      } else {
        resolve()
      }
    })
  }

  private createExpressApp(): Express {
    const app = express()

    // Root endpoint
    app.get('/', (_req, res) => {
      this.log('[REQUEST] GET /')
      this.handleRoot(res)
    })

    // HTML endpoint
    app.get('/html', (_req, res) => {
      this.log('[REQUEST] GET /html')
      this.handleHtml(res)
    })
    app.get('/html/raw', (_req, res) => {
      this.log('[REQUEST] GET /html/raw')
      void this.handleHtmlRaw(res)
    })

    // PDF endpoints
    app.get('/pdf', (_req, res) => {
      this.log('[REQUEST] GET /pdf')
      this.handlePdf(res)
    })
    app.get('/pdf/raw', (_req, res) => {
      this.log('[REQUEST] GET /pdf/raw')
      this.handlePdfRaw(res)
    })

    // SSE endpoint for live reload
    app.get('/events', (req, res) => {
      this.log('[REQUEST] GET /events')
      this.handleSseConnection(req, res)
    })

    return app
  }

  private handleRoot(res: Response): void {
    const links: string[] = []
    if (this.config.serveHtml) {
      links.push('<li><a href="/html">HTML</a></li>')
    }
    if (this.config.servePdf) {
      links.push('<li><a href="/pdf">PDF</a></li>')
    }

    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Bookify Server</title>
        </head>
        <body>
          <h1>Bookify Server</h1>
          <p>Available outputs:</p>
          <ul>
            ${links.join('\n            ')}
          </ul>
        </body>
      </html>
    `)
  }

  private handleHtml(res: Response): void {
    if (!this.config.serveHtml) {
      res.status(404).send('HTML output not enabled')
      return
    }

    const htmlViewerHtml = this.createHtmlViewerHtml()
    res.type('html').send(htmlViewerHtml)
  }

  private handleHtmlRaw(res: Response): Promise<void> {
    if (!this.config.serveHtml || !this.config.htmlPath) {
      res.status(404).send('HTML output not enabled')
      return Promise.resolve()
    }

    const absolutePath = path.resolve(this.config.htmlPath)
    this.log(`[SERVE] Serving HTML from: ${absolutePath}`)

    try {
      // Stream the file directly - more reliable than sendFile
      res.type('html')
      const stream = createReadStream(absolutePath, 'utf-8')
      stream.pipe(res)

      stream.on('error', (err) => {
        this.log(`[ERROR] Failed to stream HTML: ${err.message}`)
        if (!res.headersSent) {
          res.status(503).send('HTML content not yet generated')
        }
      })
    } catch (err) {
      this.log(`[ERROR] Failed to serve HTML: ${String(err)}`)
      res.status(503).send('HTML content not yet generated')
    }

    return Promise.resolve()
  }

  private handlePdf(res: Response): void {
    if (!this.config.servePdf) {
      res.status(404).send('PDF output not enabled')
      return
    }

    if (!this.pdfContent) {
      res.status(503).send('PDF content not yet generated')
      return
    }

    const pdfHtml = this.createPdfViewerHtml()
    res.type('html').send(pdfHtml)
  }

  private handlePdfRaw(res: Response): void {
    if (!this.config.servePdf) {
      res.status(404).send('PDF output not enabled')
      return
    }

    if (!this.pdfContent) {
      res.status(503).send('PDF content not yet generated')
      return
    }

    res.type('pdf').send(this.pdfContent)
  }

  private handleSseConnection(req: Request, res: Response): void {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    this.sseClients.push(res)
    res.write('data: connected\n\n')

    req.on('close', () => {
      this.sseClients = this.sseClients.filter((client) => client !== res)
    })
  }

  private createHtmlViewerHtml(): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>HTML Viewer</title>
          <style>
            body {
              margin: 0;
              padding: 0;
              overflow: hidden;
            }
            iframe {
              position: absolute;
              top: 0;
              left: 0;
              width: 100%;
              height: 100%;
              border: none;
            }
          </style>
        </head>
        <body>
          <iframe src="/html/raw"></iframe>
          <script>
            const eventSource = new EventSource('/events');
            eventSource.onmessage = (event) => {
              if (event.data === 'reload') {
                location.reload();
              }
            };
            eventSource.onerror = () => {
              console.error('SSE connection error, retrying...');
              setTimeout(() => location.reload(), 1000);
            };
          </script>
        </body>
      </html>
    `
  }

  private createPdfViewerHtml(): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>PDF Viewer</title>
          <style>
            body {
              margin: 0;
              padding: 0;
              overflow: hidden;
            }
            iframe {
              position: absolute;
              top: 0;
              left: 0;
              width: 100%;
              height: 100%;
              border: none;
            }
          </style>
        </head>
        <body>
          <iframe src="/pdf/raw" type="application/pdf"></iframe>
          <script>
            const eventSource = new EventSource('/events');
            eventSource.onmessage = (event) => {
              if (event.data === 'reload') {
                location.reload();
              }
            };
            eventSource.onerror = () => {
              console.error('SSE connection error, retrying...');
              setTimeout(() => location.reload(), 1000);
            };
          </script>
        </body>
      </html>
    `
  }

  private notifyClients(): void {
    for (const client of this.sseClients) {
      client.write('data: reload\n\n')
    }
  }
}
