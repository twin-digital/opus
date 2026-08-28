/** Minimal RFC 4180 CSV parser: quoted fields, embedded commas/quotes/newlines. */
export const parseCsv = (text: string): string[][] => {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let sawAny = false

  const pushField = () => {
    row.push(field)
    field = ''
  }
  const pushRow = () => {
    pushField()
    rows.push(row)
    row = []
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i)
    sawAny = true
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      pushField()
    } else if (ch === '\n') {
      pushRow()
    } else if (ch === '\r') {
      if (text[i + 1] === '\n') {
        i++
      }
      pushRow()
    } else {
      field += ch
    }
  }
  if (field !== '' || row.length > 0) {
    pushRow()
  }
  return sawAny ? rows : []
}

/** Parse a CSV with a header row into records keyed by column name. */
export const parseCsvRecords = (text: string): Record<string, string>[] => {
  const [header, ...body] = parseCsv(text)
  if (header === undefined) {
    return []
  }
  return body.map((cells) => Object.fromEntries(header.map((name, i) => [name, cells[i] ?? ''])))
}
