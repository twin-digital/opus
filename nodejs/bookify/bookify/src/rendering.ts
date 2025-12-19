/**
 * Function which is able to instantiate a {@link DocumentRendererFn}, given the name of the renderer type and a set
 * of options. Will throw an Error if the renderer name is not recognized, or the options are not valid for the
 * specified renderer.
 *
 * @param name Name of the renderer to instantiate
 * @param options Options to pass to the renderer
 */
export type RendererFactoryFn = (name: string, options: Partial<Record<string, string>>) => DocumentRendererFn

/**
 * Renders HTML content into a binary output document.
 */
export type DocumentRendererFn = (html: string) => Promise<ArrayBuffer>
