import type { Container } from 'pixi.js'
import type { FieldValue, Id } from '@thrashplay/wishem-core'
import type { Port } from '@thrashplay/wishem-hub'

/** The two operations of a port that a renderer uses. */
export type PortReader = Pick<Port, 'read' | 'subscribe'>

export interface Viewport {
  readonly width: number
  readonly height: number
}

export type ViewProps = Readonly<Record<string, FieldValue | undefined>>

/** The default export of a PixiJS view file. */
export interface PixiView<Props = ViewProps, Display extends Container = Container> {
  /** Makes the display object of one component. Called one time for each component. */
  create(): Display
  /** Sets each property of the object from the props and the viewport only. */
  update(display: Display, props: Props, viewport: Viewport): void
}

export interface CollectedView {
  /** For example `ClearColor.view.json`. */
  sidecar: string
  componentType: Id
  view: PixiView
}

export type ViewTable = ReadonlyMap<Id, CollectedView>

export interface RendererOptions {
  port: PortReader
  views: ViewTable
  /** The renderer adds one root container to it. */
  stage: Container
  /** Read at each update. */
  viewport: Viewport
  /** Gets each error of a view. Default: `console.error`. */
  onError?: (error: unknown) => void
}

export interface DrawnComponent {
  entity: Id
  componentType: Id
}

export interface PixiRenderer {
  /** The top visible component at a point of the viewport. */
  entityAt(x: number, y: number): DrawnComponent | undefined
  /** Removes the listener and destroys the objects of the renderer. A second call does nothing. */
  stop(): void
}
