import type { ReactNode } from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach } from 'vitest'

export interface RenderView {
  /**
   * The element that holds the drawn content. A new element for each test.
   */
  readonly container: HTMLDivElement
  /**
   * Draws a node in the container. A second call updates the same tree.
   */
  draw: (node: ReactNode) => void
}

/**
 * Registers the hooks of a test suite that draws React content in the DOM. Call it in a `describe` block.
 */
export const useRender = (): RenderView => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  return {
    get container() {
      return container
    },
    draw: (node) => {
      act(() => {
        root.render(node)
      })
    },
  }
}
