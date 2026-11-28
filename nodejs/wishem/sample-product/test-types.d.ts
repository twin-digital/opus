/** Types for `import.meta.glob`, which Vitest provides to the tests. */
interface ImportMeta {
  glob: <T = unknown>(
    pattern: string,
    options?: { query?: string; import?: string; eager?: boolean },
  ) => Record<string, T>
}
