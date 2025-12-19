import { describe, expect, it } from 'vitest'
import type { BookifyProjectConfig } from './model.js'
import { validateConfig } from './validate.js'

describe('validateConfig', () => {
  describe('valid configurations', () => {
    it('should accept minimal valid config with inputs', () => {
      const config: BookifyProjectConfig = {
        inputs: ['src/chapter1.md'],
      }
      expect(validateConfig(config)).toBe(true)
    })

    it('should accept config with assetPaths as string', () => {
      const config: BookifyProjectConfig = {
        inputs: ['src/chapter1.md'],
        assetPaths: 'assets',
      }
      expect(validateConfig(config)).toBe(true)
    })

    it('should accept config with assetPaths as array', () => {
      const config: BookifyProjectConfig = {
        inputs: ['src/chapter1.md'],
        assetPaths: ['assets', 'images'],
      }
      expect(validateConfig(config)).toBe(true)
    })

    it('should accept config with all optional fields', () => {
      const config: BookifyProjectConfig = {
        inputs: ['src/chapter1.md', 'src/chapter2.md'],
        assetPaths: ['assets', 'images'],
        css: ['styles/base.css', 'styles/theme.css'],
        pdf: {
          renderer: 'euro-pdf',
          rendererOptions: {
            apiKey: 'test-key',
            testMode: 'true',
          },
        },
      }
      expect(validateConfig(config)).toBe(true)
    })

    it('should accept config with euro-pdf renderer', () => {
      const config: BookifyProjectConfig = {
        inputs: ['src/chapter1.md'],
        pdf: {
          renderer: 'euro-pdf',
        },
      }
      expect(validateConfig(config)).toBe(true)
    })
  })

  describe('invalid configurations', () => {
    it('should reject config without inputs', () => {
      const config = {} as BookifyProjectConfig
      expect(validateConfig(config)).toBe(false)
      expect(validateConfig.errors).toBeDefined()
      expect(validateConfig.errors?.[0]?.message).toMatch(/required/)
    })

    it('should reject config with empty inputs array', () => {
      const config: BookifyProjectConfig = {
        inputs: [],
      }
      expect(validateConfig(config)).toBe(false)
      expect(validateConfig.errors).toBeDefined()
    })

    it('should reject config with invalid renderer', () => {
      const config = {
        inputs: ['src/chapter1.md'],
        pdf: {
          renderer: 'invalid-renderer',
        },
      } as unknown as BookifyProjectConfig
      expect(validateConfig(config)).toBe(false)
      expect(validateConfig.errors).toBeDefined()
    })

    it('should reject config with assetPaths as number', () => {
      const config = {
        inputs: ['src/chapter1.md'],
        assetPaths: 123,
      } as unknown as BookifyProjectConfig
      expect(validateConfig(config)).toBe(false)
    })

    it('should reject config with inputs as string', () => {
      const config = {
        inputs: 'src/chapter1.md',
      } as unknown as BookifyProjectConfig
      expect(validateConfig(config)).toBe(false)
    })

    it('should reject config with css as string', () => {
      const config = {
        inputs: ['src/chapter1.md'],
        css: 'styles/base.css',
      } as unknown as BookifyProjectConfig
      expect(validateConfig(config)).toBe(false)
    })

    it('should reject config with non-object pdf', () => {
      const config = {
        inputs: ['src/chapter1.md'],
        pdf: 'euro-pdf',
      } as unknown as BookifyProjectConfig
      expect(validateConfig(config)).toBe(false)
    })

    it('should reject config with non-object rendererOptions', () => {
      const config = {
        inputs: ['src/chapter1.md'],
        pdf: {
          renderer: 'euro-pdf',
          rendererOptions: 'invalid',
        },
      } as unknown as BookifyProjectConfig
      expect(validateConfig(config)).toBe(false)
    })
  })
})
