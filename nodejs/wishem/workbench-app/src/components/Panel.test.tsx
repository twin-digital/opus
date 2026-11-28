import { describe, expect, it } from 'vitest'
import { useRender } from '../test/render.js'
import { Panel } from './Panel.js'

describe('Panel', () => {
  const view = useRender()
  const part = (name: string) => view.container.querySelector(`[data-slot="${name}"]`)

  it('shows the body only when it has no title, no header content, and no footer', () => {
    view.draw(<Panel>Body</Panel>)
    expect(part('header')).toBeNull()
    expect(part('footer')).toBeNull()
    expect(part('body')?.textContent).toBe('Body')
    expect(view.container.querySelector('h2')).toBeNull()
  })

  it('shows the header with a title, as a heading 2', () => {
    view.draw(<Panel title='Replays'>Body</Panel>)
    expect(part('header')).not.toBeNull()
    expect(view.container.querySelector('h2')?.textContent).toBe('Replays')
  })

  it('shows the header with content at its end and no title', () => {
    view.draw(<Panel headerEnd={<span>Draft</span>}>Body</Panel>)
    expect(part('header')?.textContent).toBe('Draft')
    expect(view.container.querySelector('h2')).toBeNull()
  })

  it('shows the title and the content at the end of the header together', () => {
    view.draw(
      <Panel title='Replays' headerEnd={<span>Draft</span>}>
        Body
      </Panel>,
    )
    expect(part('header')?.textContent).toBe('ReplaysDraft')
  })

  it.each([null, false] as const)('shows no header for headerEnd %s and no footer for footer %s', (empty) => {
    view.draw(
      <Panel headerEnd={empty} footer={empty}>
        Body
      </Panel>,
    )
    expect(part('header')).toBeNull()
    expect(part('footer')).toBeNull()
  })

  it('draws no wrapper for the end of the header when the panel has none', () => {
    view.draw(<Panel title='Replays'>Body</Panel>)
    expect(part('header')?.children).toHaveLength(1)
  })

  it('treats an empty title as no title', () => {
    view.draw(<Panel title=''>Body</Panel>)
    expect(part('header')).toBeNull()
    expect(view.container.querySelector('h2')).toBeNull()
  })

  it('draws no heading for an empty title when the header has content at its end', () => {
    view.draw(
      <Panel title='' headerEnd={<span>Draft</span>}>
        Body
      </Panel>,
    )
    expect(part('header')?.textContent).toBe('Draft')
    expect(view.container.querySelector('h2')).toBeNull()
  })

  it.each([null, false] as const)('draws no wrapper for the end of the header for headerEnd %s', (empty) => {
    view.draw(
      <Panel title='Replays' headerEnd={empty}>
        Body
      </Panel>,
    )
    expect(part('header')?.children).toHaveLength(1)
  })

  it('holds the content of the footer', () => {
    view.draw(<Panel footer={<button type='button'>Apply</button>}>Body</Panel>)
    expect(part('footer')?.querySelector('button')?.textContent).toBe('Apply')
  })
})
