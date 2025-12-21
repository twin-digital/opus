import * as esbuild from 'esbuild'
import path from 'node:path'

/**
 * Analyzes CSS files to extract all dependencies including:
 * - @import files
 * - url() references (images, fonts, etc.)
 *
 * Uses esbuild's metafile generation to get the full dependency graph.
 *
 * @param cssFiles Array of absolute paths to CSS files
 * @returns Array of absolute paths to all dependencies
 */
export const analyzeCssDependencies = async (cssFiles: string[]): Promise<string[]> => {
  if (cssFiles.length === 0) {
    return []
  }

  try {
    // Use esbuild to analyze CSS dependencies
    const result = await esbuild.build({
      entryPoints: cssFiles,
      bundle: true,
      write: false, // Don't write output files
      outdir: '/tmp/css-analysis', // Required for file loader, but nothing will be written
      metafile: true, // Generate metafile with dependency information
      loader: {
        '.avif': 'file',
        '.bmp': 'file',
        '.css': 'css',
        '.eot': 'file',
        '.gif': 'file',
        '.ico': 'file',
        '.jpeg': 'file',
        '.jpg': 'file',
        '.mp4': 'file',
        '.ogg': 'file',
        '.otf': 'file',
        '.pdf': 'file',
        '.png': 'file',
        '.sfnt': 'file',
        '.svg': 'file',
        '.ttf': 'file',
        '.webm': 'file',
        '.webp': 'file',
        '.woff': 'file',
        '.woff2': 'file',
      },
      logLevel: 'silent', // Suppress output
    })

    // Extract all input files from the metafile
    const dependencies = new Set<string>()

    // Get all inputs from the metafile
    for (const inputPath of Object.keys(result.metafile.inputs)) {
      // Convert to absolute path
      const absolutePath = path.resolve(inputPath)
      dependencies.add(absolutePath)
    }

    return Array.from(dependencies)
  } catch (error) {
    // If esbuild fails, just return the original CSS files
    // This can happen if there are syntax errors or missing files
    console.error('Failed to analyze CSS dependencies:', error)
    return cssFiles
  }
}
