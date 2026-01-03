import fsP from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { analyzeCssDependencies } from './css-deps.js'

describe('analyzeCssDependencies', () => {
  let tempDir: string

  beforeEach(async () => {
    // Create a temporary directory for test files
    tempDir = path.join(os.tmpdir(), `css-deps-test-${Date.now()}`)
    await fsP.mkdir(tempDir, { recursive: true })
  })

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fsP.rm(tempDir, { recursive: true, force: true })
    } catch (error) {
      // Ignore errors during cleanup
    }
  })

  it('should return empty array for empty input', async () => {
    const result = await analyzeCssDependencies([])
    expect(result).toEqual([])
  })

  it('should return the CSS file itself when no dependencies', async () => {
    const cssFile = path.join(tempDir, 'simple.css')
    await fsP.writeFile(cssFile, 'body { color: red; }')

    const result = await analyzeCssDependencies([cssFile])
    expect(result).toHaveLength(1)
    expect(result).toContain(cssFile)
  })

  it('should extract @import dependencies', async () => {
    const mainCss = path.join(tempDir, 'main.css')
    const importedCss = path.join(tempDir, 'imported.css')

    await fsP.writeFile(importedCss, 'p { margin: 0; }')
    await fsP.writeFile(mainCss, "@import './imported.css';\nbody { color: blue; }")

    const result = await analyzeCssDependencies([mainCss])
    expect(result).toHaveLength(2)
    expect(result).toContain(mainCss)
    expect(result).toContain(importedCss)
  })

  it('should extract @import with url() syntax', async () => {
    const mainCss = path.join(tempDir, 'main.css')
    const importedCss = path.join(tempDir, 'imported.css')

    await fsP.writeFile(importedCss, 'p { margin: 0; }')
    await fsP.writeFile(mainCss, "@import url('./imported.css');\nbody { color: blue; }")

    const result = await analyzeCssDependencies([mainCss])
    expect(result).toHaveLength(2)
    expect(result).toContain(mainCss)
    expect(result).toContain(importedCss)
  })

  it('should extract url() references from declarations', async () => {
    const cssFile = path.join(tempDir, 'styles.css')
    const imageFile = path.join(tempDir, 'image.png')

    await fsP.writeFile(imageFile, 'fake image content')
    await fsP.writeFile(cssFile, "body { background-image: url('./image.png'); }")

    const result = await analyzeCssDependencies([cssFile])
    expect(result).toHaveLength(2)
    expect(result).toContain(cssFile)
    expect(result).toContain(imageFile)
  })

  it('should skip data URIs', async () => {
    const cssFile = path.join(tempDir, 'styles.css')
    await fsP.writeFile(cssFile, 'body { background-image: url(data:image/png;base64,abc123); }')

    const result = await analyzeCssDependencies([cssFile])
    expect(result).toHaveLength(1)
    expect(result).toContain(cssFile)
  })

  it('should skip absolute URLs', async () => {
    const cssFile = path.join(tempDir, 'styles.css')
    await fsP.writeFile(cssFile, 'body { background-image: url(https://example.com/image.png); }')

    const result = await analyzeCssDependencies([cssFile])
    expect(result).toHaveLength(1)
    expect(result).toContain(cssFile)
  })

  it('should handle nested @imports', async () => {
    const mainCss = path.join(tempDir, 'main.css')
    const level1Css = path.join(tempDir, 'level1.css')
    const level2Css = path.join(tempDir, 'level2.css')

    await fsP.writeFile(level2Css, 'h3 { font-size: 1rem; }')
    await fsP.writeFile(level1Css, "@import './level2.css';\nh2 { font-size: 1.5rem; }")
    await fsP.writeFile(mainCss, "@import './level1.css';\nh1 { font-size: 2rem; }")

    const result = await analyzeCssDependencies([mainCss])
    expect(result).toHaveLength(3)
    expect(result).toContain(mainCss)
    expect(result).toContain(level1Css)
    expect(result).toContain(level2Css)
  })

  it('should not duplicate dependencies', async () => {
    const mainCss = path.join(tempDir, 'main.css')
    const sharedCss = path.join(tempDir, 'shared.css')
    const import1Css = path.join(tempDir, 'import1.css')
    const import2Css = path.join(tempDir, 'import2.css')

    await fsP.writeFile(sharedCss, 'p { margin: 0; }')
    await fsP.writeFile(import1Css, "@import './shared.css';\n.class1 { color: red; }")
    await fsP.writeFile(import2Css, "@import './shared.css';\n.class2 { color: blue; }")
    await fsP.writeFile(mainCss, "@import './import1.css';\n@import './import2.css';")

    const result = await analyzeCssDependencies([mainCss])
    expect(result).toHaveLength(4)
    expect(result).toContain(mainCss)
    expect(result).toContain(sharedCss)
    expect(result).toContain(import1Css)
    expect(result).toContain(import2Css)
  })

  it('should handle multiple entry points', async () => {
    const css1 = path.join(tempDir, 'style1.css')
    const css2 = path.join(tempDir, 'style2.css')
    const shared = path.join(tempDir, 'shared.css')

    await fsP.writeFile(shared, 'p { margin: 0; }')
    await fsP.writeFile(css1, "@import './shared.css';\n.style1 { color: red; }")
    await fsP.writeFile(css2, "@import './shared.css';\n.style2 { color: blue; }")

    const result = await analyzeCssDependencies([css1, css2])
    expect(result).toHaveLength(3)
    expect(result).toContain(css1)
    expect(result).toContain(css2)
    expect(result).toContain(shared)
  })

  it('should handle missing files gracefully', async () => {
    const cssFile = path.join(tempDir, 'styles.css')
    await fsP.writeFile(cssFile, "@import './missing.css';\nbody { color: red; }")

    const result = await analyzeCssDependencies([cssFile])
    // Should at least include the main file
    expect(result).toContain(cssFile)
    // Should also include the missing file path in dependencies
    expect(result).toContain(path.join(tempDir, 'missing.css'))
  })

  it('should handle missing root CSS files gracefully', async () => {
    const missingCss = path.join(tempDir, 'missing-root.css')

    // Call with a missing file as root dependency
    const result = await analyzeCssDependencies([missingCss])

    // Should include the missing file in dependencies for watching
    expect(result).toContain(missingCss)
  })

  it('should extract @import with media queries', async () => {
    const mainCss = path.join(tempDir, 'main.css')
    const importedCss = path.join(tempDir, 'imported.css')

    await fsP.writeFile(importedCss, 'p { margin: 0; }')
    await fsP.writeFile(mainCss, "@import './imported.css' screen and (min-width: 800px);\nbody { color: blue; }")

    const result = await analyzeCssDependencies([mainCss])
    expect(result).toHaveLength(2)
    expect(result).toContain(mainCss)
    expect(result).toContain(importedCss)
  })

  it('should handle reasonably large CSS files efficiently', async () => {
    // Performance test: Generate a moderately large CSS file (~500KB)
    // Expected performance: File I/O + parsing should complete in reasonable time
    const cssFile = path.join(tempDir, 'large.css')
    const rules = []

    // Generate 10,000 CSS rules (~500KB)
    for (let i = 0; i < 10000; i++) {
      // Generate valid 6-digit hex colors by cycling through a limited range
      const color = (i % 0xffffff).toString(16).padStart(6, '0')
      rules.push(`.class-${i} { color: #${color}; padding: ${i % 100}px; }`)
    }

    await fsP.writeFile(cssFile, rules.join('\n'))

    const startTime = performance.now()
    const result = await analyzeCssDependencies([cssFile])
    const duration = performance.now() - startTime

    expect(result).toContain(cssFile)
    // Should complete in under 500ms for a 500KB file (includes I/O + parsing)
    // test has allowance for CI runners can be slower than local machines due to I/O constraints
    expect(duration).toBeLessThan(5000)
  })

  it('should skip absolute URLs in @import', async () => {
    const cssFile = path.join(tempDir, 'styles.css')
    await fsP.writeFile(cssFile, "@import 'https://example.com/styles.css';\nbody { color: red; }")

    const result = await analyzeCssDependencies([cssFile])
    expect(result).toHaveLength(1)
    expect(result).toContain(cssFile)
  })

  it('should skip protocol-relative URLs in @import', async () => {
    const cssFile = path.join(tempDir, 'styles.css')
    await fsP.writeFile(cssFile, "@import '//example.com/styles.css';\nbody { color: red; }")

    const result = await analyzeCssDependencies([cssFile])
    expect(result).toHaveLength(1)
    expect(result).toContain(cssFile)
  })
})
