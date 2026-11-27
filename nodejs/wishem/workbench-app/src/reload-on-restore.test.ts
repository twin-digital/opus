import { describe, expect, it, vi } from 'vitest'
import { reloadOnRestore } from './reload-on-restore.js'

const pageShow = (persisted: boolean) => {
  const target = new EventTarget()
  const reload = vi.fn()
  reloadOnRestore(target as unknown as Window, reload)
  target.dispatchEvent(Object.assign(new Event('pageshow'), { persisted }))
  return reload
}

describe('reloadOnRestore', () => {
  it('reloads the page when the browser restores it from the cache', () => {
    expect(pageShow(true)).toHaveBeenCalledTimes(1)
  })

  it('does nothing for a normal page show', () => {
    expect(pageShow(false)).not.toHaveBeenCalled()
  })
})
