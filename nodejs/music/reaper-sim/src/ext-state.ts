/** Ext-state values by key within named sections. Lookups are case-sensitive unless noted. */
export class ExtStateStore {
  private readonly sections = new Map<string, Map<string, string>>()

  get(section: string, key: string): string | undefined {
    return this.sections.get(section)?.get(key)
  }

  /** Looks up a value ignoring the case of the section and key, as the web remote reads. */
  find(section: string, key: string): string | undefined {
    const s = section.toUpperCase()
    const k = key.toUpperCase()
    for (const [name, values] of this.sections) {
      if (name.toUpperCase() !== s) {
        continue
      }
      for (const [candidate, value] of values) {
        if (candidate.toUpperCase() === k) {
          return value
        }
      }
    }
    return undefined
  }

  /** Stores a value; an empty value deletes the key. */
  set(section: string, key: string, value: string): void {
    if (value === '') {
      this.delete(section, key)
      return
    }
    let values = this.sections.get(section)
    if (values === undefined) {
      values = new Map()
      this.sections.set(section, values)
    }
    values.set(key, value)
  }

  delete(section: string, key: string): void {
    const values = this.sections.get(section)
    values?.delete(key)
    if (values?.size === 0) {
      this.sections.delete(section)
    }
  }

  deleteSection(section: string): void {
    this.sections.delete(section)
  }

  /** A section's entries in insertion order. */
  entries(section: string): [key: string, value: string][] {
    return [...(this.sections.get(section) ?? [])]
  }
}
