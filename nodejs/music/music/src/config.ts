if (typeof process !== 'undefined' && process.versions.node) {
  await import('dotenv').then((dotenv) => dotenv.config())
}

export const getConfig = () => ({
  logLevel:
    (typeof process === 'undefined' ? (import.meta.env.VITE_LOG_LEVEL as string) : process.env.LOG_LEVEL) ?? 'info',
})
