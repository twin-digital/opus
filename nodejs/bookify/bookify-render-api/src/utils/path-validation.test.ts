import { describe, it, expect } from 'vitest'
import { isRelativePath } from './path-validation.js'

describe('isRelativePath', () => {
  it('should reject empty string', () => {
    expect(isRelativePath('')).toBe(false)
  })

  it('should reject Unix absolute paths', () => {
    expect(isRelativePath('/etc/passwd')).toBe(false)
    expect(isRelativePath('/foo')).toBe(false)
  })

  it('should reject Windows absolute paths', () => {
    if (process.platform === 'win32') {
      expect(isRelativePath('C:/Windows')).toBe(false)
      expect(isRelativePath('C:\\Windows')).toBe(false)
    }
  })

  it('should reject paths starting with ..', () => {
    expect(isRelativePath('..')).toBe(false)
    expect(isRelativePath('../foo')).toBe(false)
  })

  it('should reject paths that normalize to parent escape (security vulnerability)', () => {
    // The critical test case - appears safe but escapes parent after normalization
    expect(isRelativePath('child/../../sibling')).toBe(false)
    expect(isRelativePath('a/b/c/../../../../etc/passwd')).toBe(false)
  })

  it('should accept current directory references', () => {
    expect(isRelativePath('.')).toBe(true)
    expect(isRelativePath('./foo')).toBe(true)
  })

  it('should accept simple relative paths', () => {
    expect(isRelativePath('foo')).toBe(true)
    expect(isRelativePath('foo/bar/baz.md')).toBe(true)
  })

  it('should accept paths with internal parent references that stay within bounds', () => {
    expect(isRelativePath('foo/bar/../baz')).toBe(true)
    expect(isRelativePath('a/../b')).toBe(true)
  })

  it('should handle trailing slashes', () => {
    expect(isRelativePath('foo/')).toBe(true)
    expect(isRelativePath('../')).toBe(false)
  })

  it('should handle multiple consecutive slashes', () => {
    expect(isRelativePath('foo//bar')).toBe(true)
  })

  it('should handle unicode and special characters', () => {
    expect(isRelativePath('café/文档.md')).toBe(true)
    expect(isRelativePath('foo bar/baz')).toBe(true)
    expect(isRelativePath('file-with-dash.md')).toBe(true)
  })
})
