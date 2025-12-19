import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { BookifyProjectConfig } from './model.js'
import { resolveConfig } from './resolve.js'

describe('resolveConfig', () => {
  describe('path resolution', () => {
    it('should resolve input paths to absolute paths', () => {
      const config: BookifyProjectConfig = {
        inputs: ['src/chapter1.md'],
      }
      const resolved = resolveConfig(config)
      expect(resolved.inputs[0]).toMatch(/^\/.*src\/chapter1\.md$/)
    })

    it('should resolve assetPaths string to absolute path array', () => {
      const config: BookifyProjectConfig = {
        inputs: ['src/chapter1.md'],
        assetPaths: 'assets',
      }
      const resolved = resolveConfig(config)
      expect(Array.isArray(resolved.assetPaths)).toBe(true)
      expect(resolved.assetPaths).toHaveLength(1)
      expect(resolved.assetPaths[0]).toMatch(/^\/.*assets$/)
    })

    it('should resolve assetPaths array to absolute paths', () => {
      const config: BookifyProjectConfig = {
        inputs: ['src/chapter1.md'],
        assetPaths: ['assets', 'images'],
      }
      const resolved = resolveConfig(config)
      expect(resolved.assetPaths).toHaveLength(2)
      expect(resolved.assetPaths[0]).toMatch(/^\/.*assets$/)
      expect(resolved.assetPaths[1]).toMatch(/^\/.*images$/)
    })

    it('should default assetPaths to cwd when undefined', () => {
      const config: BookifyProjectConfig = {
        inputs: ['src/chapter1.md'],
      }
      const resolved = resolveConfig(config)
      expect(resolved.assetPaths).toHaveLength(1)
      expect(resolved.assetPaths[0]).toBe(process.cwd())
    })

    it('should resolve css paths to absolute paths', () => {
      const config: BookifyProjectConfig = {
        inputs: ['src/chapter1.md'],
        css: ['styles/base.css', 'styles/theme.css'],
      }
      const resolved = resolveConfig(config)
      expect(resolved.css[0]).toMatch(/^\/.*styles\/base\.css$/)
      expect(resolved.css[1]).toMatch(/^\/.*styles\/theme\.css$/)
    })

    it('should default css to empty array', () => {
      const config: BookifyProjectConfig = {
        inputs: ['src/chapter1.md'],
      }
      const resolved = resolveConfig(config)
      expect(resolved.css).toEqual([])
    })

    it('should resolve pkg:// prefixed CSS paths to package file paths', () => {
      const config: BookifyProjectConfig = {
        inputs: ['src/chapter1.md'],
        css: ['pkg://vitest/package.json'], // Using a known installed package for testing
      }
      const resolved = resolveConfig(config)
      expect(resolved.css).toHaveLength(1)
      expect(resolved.css[0]).toMatch(/vitest.*package\.json$/)
      expect(path.isAbsolute(resolved.css[0])).toBe(true)
    })

    it('should throw error for unresolvable pkg:// paths', () => {
      const config: BookifyProjectConfig = {
        inputs: ['src/chapter1.md'],
        css: ['pkg://this-package-definitely-does-not-exist/style.css'],
      }
      expect(() => resolveConfig(config)).toThrow(/Failed to resolve npm package path/)
    })

    it('should mix regular paths and pkg:// paths', () => {
      const config: BookifyProjectConfig = {
        inputs: ['src/chapter1.md'],
        css: ['styles/base.css', 'pkg://vitest/package.json', 'styles/theme.css'],
      }
      const resolved = resolveConfig(config)
      expect(resolved.css).toHaveLength(3)
      expect(resolved.css[0]).toMatch(/^\/.*styles\/base\.css$/)
      expect(resolved.css[1]).toMatch(/vitest.*package\.json$/)
      expect(resolved.css[2]).toMatch(/^\/.*styles\/theme\.css$/)
    })
  })

  describe('renderer configuration', () => {
    it('should default renderer to euro-pdf', () => {
      const config: BookifyProjectConfig = {
        inputs: ['src/chapter1.md'],
      }
      const resolved = resolveConfig(config)
      expect(resolved.pdf.renderer).toBe('euro-pdf')
    })

    it('should use specified renderer', () => {
      const config: BookifyProjectConfig = {
        inputs: ['src/chapter1.md'],
        pdf: {
          renderer: 'euro-pdf',
        },
      }
      const resolved = resolveConfig(config)
      expect(resolved.pdf.renderer).toBe('euro-pdf')
    })

    it('should merge user rendererOptions with defaults', () => {
      const config: BookifyProjectConfig = {
        inputs: ['src/chapter1.md'],
        pdf: {
          renderer: 'euro-pdf',
          rendererOptions: {
            userOption: 'user-value',
          },
        },
      }
      const resolved = resolveConfig(config)
      expect(resolved.pdf.rendererOptions.userOption).toBe('user-value')
    })

    it('should default rendererOptions to empty object when undefined', () => {
      const config: BookifyProjectConfig = {
        inputs: ['src/chapter1.md'],
        pdf: {
          renderer: 'euro-pdf',
        },
      }
      const resolved = resolveConfig(config)
      expect(resolved.pdf.rendererOptions).toBeDefined()
      expect(typeof resolved.pdf.rendererOptions).toBe('object')
    })
  })

  describe('environment variable resolution', () => {
    it('should read renderer options from environment variables', () => {
      const originalApiKey = process.env.EURO_PDF_API_KEY
      const originalTestMode = process.env.EURO_PDF_TEST_MODE

      try {
        process.env.EURO_PDF_API_KEY = 'env-api-key'
        process.env.EURO_PDF_TEST_MODE = 'true'

        const config: BookifyProjectConfig = {
          inputs: ['src/chapter1.md'],
          pdf: {
            renderer: 'euro-pdf',
          },
        }
        const resolved = resolveConfig(config)

        expect(resolved.pdf.rendererOptions.apiKey).toBe('env-api-key')
        expect(resolved.pdf.rendererOptions.testMode).toBe('true')
      } finally {
        if (originalApiKey !== undefined) {
          process.env.EURO_PDF_API_KEY = originalApiKey
        } else {
          delete process.env.EURO_PDF_API_KEY
        }
        if (originalTestMode !== undefined) {
          process.env.EURO_PDF_TEST_MODE = originalTestMode
        } else {
          delete process.env.EURO_PDF_TEST_MODE
        }
      }
    })

    it('should convert snake_case env vars to camelCase options', () => {
      const originalVar = process.env.EURO_PDF_SOME_LONG_OPTION

      try {
        process.env.EURO_PDF_SOME_LONG_OPTION = 'test-value'

        const config: BookifyProjectConfig = {
          inputs: ['src/chapter1.md'],
          pdf: {
            renderer: 'euro-pdf',
          },
        }
        const resolved = resolveConfig(config)

        expect(resolved.pdf.rendererOptions.someLongOption).toBe('test-value')
      } finally {
        if (originalVar !== undefined) {
          process.env.EURO_PDF_SOME_LONG_OPTION = originalVar
        } else {
          delete process.env.EURO_PDF_SOME_LONG_OPTION
        }
      }
    })

    it('should allow user options to override environment variables', () => {
      const originalApiKey = process.env.EURO_PDF_API_KEY

      try {
        process.env.EURO_PDF_API_KEY = 'env-api-key'

        const config: BookifyProjectConfig = {
          inputs: ['src/chapter1.md'],
          pdf: {
            renderer: 'euro-pdf',
            rendererOptions: {
              apiKey: 'user-api-key',
            },
          },
        }
        const resolved = resolveConfig(config)

        expect(resolved.pdf.rendererOptions.apiKey).toBe('user-api-key')
      } finally {
        if (originalApiKey !== undefined) {
          process.env.EURO_PDF_API_KEY = originalApiKey
        } else {
          delete process.env.EURO_PDF_API_KEY
        }
      }
    })

    it('should only read env vars with matching renderer prefix', () => {
      const originalEuroVar = process.env.EURO_PDF_API_KEY
      const originalOtherVar = process.env.OTHER_RENDERER_API_KEY

      try {
        process.env.EURO_PDF_API_KEY = 'euro-key'
        process.env.OTHER_RENDERER_API_KEY = 'other-key'

        const config: BookifyProjectConfig = {
          inputs: ['src/chapter1.md'],
          pdf: {
            renderer: 'euro-pdf',
          },
        }
        const resolved = resolveConfig(config)

        expect(resolved.pdf.rendererOptions.apiKey).toBe('euro-key')
        expect(resolved.pdf.rendererOptions.otherRendererApiKey).toBeUndefined()
      } finally {
        if (originalEuroVar !== undefined) {
          process.env.EURO_PDF_API_KEY = originalEuroVar
        } else {
          delete process.env.EURO_PDF_API_KEY
        }
        if (originalOtherVar !== undefined) {
          process.env.OTHER_RENDERER_API_KEY = originalOtherVar
        } else {
          delete process.env.OTHER_RENDERER_API_KEY
        }
      }
    })
  })
})
