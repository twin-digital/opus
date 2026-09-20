if (typeof process !== 'undefined' && process.versions.node) {
  await import('dotenv').then((dotenv) => dotenv.config())
}

export const getConfig = () => ({
  logLevel:
    (typeof process === 'undefined' ? (import.meta.env.VITE_LOG_LEVEL as string) : process.env.LOG_LEVEL) ?? 'info',

  /** Base URL of REAPER's web remote (MUSIC_REAPER_URL); the studio transport is enabled only when set. */
  reaperUrl: typeof process === 'undefined' ? undefined : process.env.MUSIC_REAPER_URL,

  /** Port the studio's touch page is served on (MUSIC_STUDIO_PORT). */
  studioPort: Number(typeof process === 'undefined' ? '' : (process.env.MUSIC_STUDIO_PORT ?? '8765')) || 8765,
})
