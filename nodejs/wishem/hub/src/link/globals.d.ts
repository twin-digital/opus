declare function setTimeout(callback: () => void, delayMs: number): unknown
declare function clearTimeout(handle: unknown): void
declare const crypto: { getRandomValues: (array: Uint8Array) => Uint8Array }
