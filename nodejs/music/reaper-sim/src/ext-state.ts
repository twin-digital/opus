/**
 * Ext-state values by key within named sections, as REAPER keeps them: sections and keys are stored
 * upper-cased, so every lookup ignores case, and a section's keys enumerate in sorted order.
 */
export class ExtStateStore {
  private readonly sections = new Map<string, Map<string, string>>()

  /**
   * @param emptyDeletes Whether storing an empty value deletes the key, as it does in project ext
   *   state; global ext state keeps the key with an empty value.
   */
  constructor(private readonly emptyDeletes: boolean) {}

  get(section: string, key: string): string | undefined {
    return this.sections.get(section.toUpperCase())?.get(key.toUpperCase())
  }

  set(section: string, key: string, value: string): void {
    if (value === '' && this.emptyDeletes) {
      this.delete(section, key)
      return
    }
    const name = section.toUpperCase()
    let values = this.sections.get(name)
    if (values === undefined) {
      values = new Map()
      this.sections.set(name, values)
    }
    values.set(key.toUpperCase(), value)
  }

  delete(section: string, key: string): void {
    const name = section.toUpperCase()
    const values = this.sections.get(name)
    values?.delete(key.toUpperCase())
    if (values?.size === 0) {
      this.sections.delete(name)
    }
  }

  deleteSection(section: string): void {
    this.sections.delete(section.toUpperCase())
  }

  clear(): void {
    this.sections.clear()
  }

  /**
   * A section's entries, as stored, in sorted key order.
   */
  entries(section: string): [key: string, value: string][] {
    return [...(this.sections.get(section.toUpperCase()) ?? [])].sort(([a], [b]) =>
      a < b ? -1
      : a > b ? 1
      : 0,
    )
  }
}
