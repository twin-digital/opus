/** Daemon build version, surfaced by `/healthz`. Kept in its own module so the
 * HTTP/daemon layer can read it without importing the package barrel (which
 * would create an import cycle). */
export const version = '0.0.0'
