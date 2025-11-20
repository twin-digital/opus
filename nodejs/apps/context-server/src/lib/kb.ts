export interface Chunk {
  text: string
  metadata: Record<string, unknown>
}

// Very small hardcoded KB for initial development. Returns synthetic chunks.
export const search = (kbId: string, query: string, limit: number): Promise<Chunk[]> => {
  const count = Math.max(0, Math.min(limit, 100))
  const results: Chunk[] = []
  for (let i = 0; i < count; i++) {
    results.push({
      text: `(${kbId}) chunk #${i + 1} — matching for query: "${query.slice(0, 80)}"`,
      metadata: {
        id: `${kbId}-c${i + 1}`,
        score: Number((1 - i * 0.01).toFixed(3)),
      },
    })
  }
  return Promise.resolve(results)
}
