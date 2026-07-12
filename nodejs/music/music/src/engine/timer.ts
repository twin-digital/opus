// cross-platform high-res clock, returned value in milliseconds
export const currentTimeMillis = (() => {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (typeof performance !== 'undefined' && performance.now) {
    return () => performance.now()
  }

  // Node fallback (requires `import 'perf_hooks'` in Node ESM)
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (typeof process !== 'undefined' && process.hrtime) {
    return () => Number(process.hrtime.bigint()) / 1e6
  }

  // fallback to less accurate timer
  return () => Date.now()
})()
