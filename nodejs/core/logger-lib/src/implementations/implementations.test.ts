/* eslint-disable @typescript-eslint/no-empty-function */
import { describe, expect, it, vi } from 'vitest'
import { consoleLogger, noopLogger } from './implementations.js'

describe('consoleLogger', () => {
  it('should call console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    consoleLogger.error('test error', { foo: 'bar' })
    expect(spy).toHaveBeenCalledWith('test error', { foo: 'bar' })
    spy.mockRestore()
  })

  it('should call console.warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    consoleLogger.warn('test warning')
    expect(spy).toHaveBeenCalledWith('test warning')
    spy.mockRestore()
  })

  it('should call console.info', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {})
    consoleLogger.info('test info', 123)
    expect(spy).toHaveBeenCalledWith('test info', 123)
    spy.mockRestore()
  })

  it('should call console.debug', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    consoleLogger.debug('test debug')
    expect(spy).toHaveBeenCalledWith('test debug')
    spy.mockRestore()
  })
})

describe('noopLogger', () => {
  it('should not throw when calling error', () => {
    expect(() => {
      noopLogger.error('test')
    }).not.toThrow()
  })

  it('should not throw when calling warn', () => {
    expect(() => {
      noopLogger.warn('test')
    }).not.toThrow()
  })

  it('should not throw when calling info', () => {
    expect(() => {
      noopLogger.info('test')
    }).not.toThrow()
  })

  it('should not throw when calling debug', () => {
    expect(() => {
      noopLogger.debug('test')
    }).not.toThrow()
  })

  it('should not produce any output', () => {
    const errorSpy = vi.spyOn(console, 'error')
    const warnSpy = vi.spyOn(console, 'warn')
    const infoSpy = vi.spyOn(console, 'info')
    const debugSpy = vi.spyOn(console, 'debug')

    noopLogger.error('error')
    noopLogger.warn('warn')
    noopLogger.info('info')
    noopLogger.debug('debug')

    expect(errorSpy).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
    expect(infoSpy).not.toHaveBeenCalled()
    expect(debugSpy).not.toHaveBeenCalled()

    errorSpy.mockRestore()
    warnSpy.mockRestore()
    infoSpy.mockRestore()
    debugSpy.mockRestore()
  })
})
