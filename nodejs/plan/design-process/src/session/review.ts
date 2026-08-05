import type { CommandRunner, PullRequest } from '../land.js'
import type { OpenEntry } from './entries.js'

/** One note the owner left, anchored to the entry it concerns. */
export interface Note {
  entry: OpenEntry
  note: string
}

/** A comment in the review a submit posts, or a paragraph of its body where the diff does not reach. */
export interface ReviewDraft {
  body: string
  comments: { path: string; line: number; side: 'RIGHT'; body: string }[]
}

/** Injected by the tests; defaults to the GitHub API call carrying the owner's token in a header. */
export type ReviewPoster = (token: string, pullRequest: PullRequest, review: ReviewDraft) => Promise<void>

const HUNK = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/

/** The new-file line ranges the pull request's diff reaches, by path. */
export const diffRanges = (diff: string): Map<string, [number, number][]> => {
  const ranges = new Map<string, [number, number][]>()
  let path = ''
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ b/')) {
      path = line.slice(6)
      continue
    }
    const hunk = HUNK.exec(line)
    if (hunk !== null && path !== '') {
      const start = Number(hunk[1])
      const count = hunk[2] ? Number(hunk[2]) : 1
      ranges.set(path, [...(ranges.get(path) ?? []), [start, start + Math.max(count, 1) - 1]])
    }
  }
  return ranges
}

/** The line the entry's own `id:` sits on, one-based; the comment anchors there. */
export const entryLine = (source: string, id: string): number | undefined => {
  const at = source.split('\n').findIndex((line) => new RegExp(`(?:^|- )id:\\s*${id}\\s*$`).test(line))
  return at === -1 ? undefined : at + 1
}

/**
 * The one `COMMENT` review a submit carrying notes posts. Each note is a comment against the lines
 * of the entry it concerns; a note the diff does not reach goes into the body naming the entry,
 * since github refuses a comment on a line outside the diff (d-f1b5r2f8).
 */
export const draftReview = (
  notes: Note[],
  read: (path: string) => string,
  ranges: Map<string, [number, number][]>,
): ReviewDraft | undefined => {
  if (notes.length === 0) {
    return undefined
  }
  const review: ReviewDraft = { body: '', comments: [] }
  const orphaned: string[] = []
  for (const { entry, note } of notes) {
    let line: number | undefined
    try {
      line = entryLine(read(entry.path), entry.id)
    } catch {
      line = undefined
    }
    const reaches = (ranges.get(entry.path) ?? []).some(
      ([from, to]) => line !== undefined && line >= from && line <= to,
    )
    if (line !== undefined && reaches) {
      review.comments.push({ path: entry.path, line, side: 'RIGHT', body: note })
    } else {
      orphaned.push(`**${entry.id}** — ${note}`)
    }
  }
  review.body = orphaned.join('\n\n')
  return review
}

/** The diff the pull request carries, for deciding which notes can anchor to a line. */
export const readDiff = (run: CommandRunner, root: string, pullRequest: PullRequest): string => {
  try {
    return run('gh', ['pr', 'diff', String(pullRequest.number)], { cwd: root })
  } catch {
    return ''
  }
}

/**
 * Post the review as the owner, with the token the owner typed and nothing else. Opening the pull
 * request, pushing, and the merge use the environment's own credentials (d-ex0pr4e4).
 */
export const postReview: ReviewPoster = async (token, pullRequest, review) => {
  const response = await fetch(
    `https://api.github.com/repos/${pullRequest.owner}/${pullRequest.repo}/pulls/${pullRequest.number}/reviews`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ event: 'COMMENT', body: review.body, comments: review.comments }),
    },
  )
  if (!response.ok) {
    throw new Error(`the review was refused: ${response.status} ${await response.text()}`)
  }
}
