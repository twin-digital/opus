/**
 * Raw user-supplied configuration for a project.
 */
export interface BookifyProjectConfig {
  /**
   * Optional path(s) to the asset root(s) from which images and other data files will be loaded. This is relative to the
   * project file. Can be a single path string or an array of paths.
   */
  assetPaths?: string | string[]

  /**
   * Optional list of declared CSS entries
   */
  css?: string[]

  /**
   * Declared input files
   */
  inputs: string[]

  /**
   * Options for configuring how PDFs are rendered.
   */
  pdf?: {
    /**
     * Name of the renderer to use.
     */
    renderer?: 'euro-pdf'

    /**
     * Optional arguments to pass to the renderer implementation. Default values will be set from environment variables.
     * The value of the `renderer` property will be converted to all-caps snakecase (e.g., 'euro-pdf' becomes 'EURO_PDF'),
     * and then similarly cased option names may be appended (separated by an underscore). For example, if the renderer
     * name is "euro-pdf", the following are some example renderer options that will be set from the environment:
     *
     *   - EURO_PDF_API_KEY
     *   - EURO_PDF_TEST_MODE
     *
     * Similar logic is applied to other renderers and/or option names.
     */
    rendererOptions?: Record<string, string>
  }
}

/**
 * Normalized project configuration with all defaults applied, paths resolved, etc.
 */
export interface BookifyProject {
  /**
   * The absolute paths to use for loading images and other data files.
   */
  assetPaths: string[]

  /**
   * Absolute paths to any CSS files which should be used for rendering.
   */
  css: string[]

  /**
   * Absolute paths to all inputs to use for rendering.
   */
  inputs: string[]

  /**
   * Configuration to use when rendering PDFs.
   */
  pdf: {
    /**
     * Name of the renderer to use.
     */
    renderer: 'euro-pdf'

    /**
     * Full set of options to use, including those read from the environment and explicitly set by the user.
     */

    /**
     * Full set of optiosn to pass to the renderer implementation. Default values will be set from environment
     * variables. To accomplish this, the value of the `renderer` property will be converted to all-caps snakecase
     * (e.g., 'euro-pdf' becomes 'EURO_PDF'), and then similarly cased option names may be appended (separated by an
     * underscore). For example, if the renderer name is "euro-pdf", the following are some example renderer options
     * that will be set from the environment:
     *
     *   - EURO_PDF_API_KEY: becomes 'apiKey' option
     *   - EURO_PDF_TEST_MODE: becomes 'testMode' option
     *
     * Similar logic is applied to other renderers and/or option names.
     */
    rendererOptions: Record<string, string>
  }
}
