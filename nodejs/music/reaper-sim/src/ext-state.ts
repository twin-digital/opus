/**
 * Ext-state values by key within named sections. Sections and keys match case-sensitively.
 */
export class ExtStateStore {
  private readonly sections = new Map<string, Map<string, string>>()

  get(section: string, key: string): string | undefined {
    return this.sections.get(section)?.get(key)
  }

  /**
   * Stores a value; an empty value deletes the key.
   */
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

  sectionNames(): string[] {
    return [...this.sections.keys()]
  }

  /**
   * A section's entries in insertion order.
   */
  entries(section: string): [key: string, value: string][] {
    return [...(this.sections.get(section) ?? [])]
  }
}
