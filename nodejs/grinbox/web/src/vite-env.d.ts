/// <reference types="vite/client" />

/**
 * The build-time settings the browser application reads. Declaring them keeps
 * `import.meta.env` typed: vite's own `ImportMetaEnv` has an `any` index
 * signature, so an undeclared variable reads as `any` and silently spreads.
 */
interface ImportMetaEnv {
  /**
   * Base URL for the daemon's API. Empty by default — the daemon serves this
   * application, so the API is same-origin; set it only for split-origin dev.
   */
  readonly VITE_API_BASE?: string
  /** Explicit public callback origin for the authorization pop-up. */
  readonly VITE_OAUTH_CALLBACK_ORIGIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
