import { describe, expect, it } from 'vitest'
import { accountFoldersSchema, folderNameSchema, folderSchema, FOLDER_ROLES } from './index.js'

// --- a folder name is as the user wrote it (d-k8va629q) -------------------

describe('folderNameSchema', () => {
  it('keeps the name character for character — no trim, no case fold', () => {
    const parsed = folderNameSchema.parse(' Archive/2026 ')
    expect(parsed).toBe(' Archive/2026 ')
  })

  it('reads no hierarchy into a separator', () => {
    expect(folderNameSchema.safeParse('INBOX.Later').success).toBe(true)
    expect(folderNameSchema.safeParse('[Gmail]/All Mail').success).toBe(true)
  })

  it('rejects the empty name and one carrying a line break', () => {
    expect(folderNameSchema.safeParse('').success).toBe(false)
    expect(folderNameSchema.safeParse('Later\nArchive').success).toBe(false)
  })
})

// --- the four folders an Account names (d-zxvkt95o) -----------------------

describe('accountFoldersSchema', () => {
  const folders = { arrival: 'INBOX', archived: 'Archive', trashed: 'Trash', spam: 'Junk' }

  it('names one folder per role', () => {
    expect(FOLDER_ROLES).toEqual(['arrival', 'archived', 'trashed', 'spam'])
    expect(accountFoldersSchema.safeParse(folders).success).toBe(true)
  })

  it('refuses two roles naming one folder', () => {
    const parsed = accountFoldersSchema.safeParse({ ...folders, spam: 'Trash' })
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues[0]?.path).toEqual(['spam'])
  })

  it('requires all four', () => {
    expect(accountFoldersSchema.safeParse({ arrival: 'INBOX' }).success).toBe(false)
  })
})

// --- the folders the interface offers (r-e40s6olu) ------------------------

describe('folderSchema', () => {
  it('carries the role grinbox proposes for a folder', () => {
    expect(folderSchema.safeParse({ name: 'Archive', proposed_role: 'archived' }).success).toBe(true)
  })

  it('carries null where grinbox proposes none', () => {
    expect(folderSchema.safeParse({ name: 'Receipts', proposed_role: null }).success).toBe(true)
  })
})
