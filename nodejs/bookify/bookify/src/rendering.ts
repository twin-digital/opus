/**
 * Renders HTML content into a binary output document.
 */
export type DocumentRendererFn = (html: string) => Promise<ArrayBuffer>

/**
 * Renders an input standalone HTML document (with styles, images, etc. embedded) with a specific renderer.
 */
export const renderDocument = (html: string, renderer: DocumentRendererFn): Promise<ArrayBuffer> => renderer(html)
