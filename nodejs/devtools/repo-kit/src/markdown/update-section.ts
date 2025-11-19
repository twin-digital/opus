const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Updates a section of a markdown file by looking for specific 'marker' comments, and replacing the content between
 * them with new text. If the marker is found multiple times in the markdown, _all_ occurrences will be replaced.
 *
 * @returns The new content, with the section updated or appended as required.
 */
export const updateSection = ({
  content,
  markdown,
  missing = 'insert',
  sectionId,
}: {
  /**
   * Updated content for the section
   */
  content: string

  /**
   * Original markdown content to update.
   */
  markdown: string

  /**
   * What to do if the section with the specified `sectionId` does not exist:
   *
   * - error: throw an error
   * - insert: append the section and the required markers
   * - skip: do nothing, return false
   */
  missing?: 'error' | 'insert' | 'skip'

  /**
   * Unique string used to identify the section in the markdwon document. This function will replace anything between
   * a pair of HTML comments matching `<!-- BEGIN <sectionId> -->` and  `<!-- END <sectionId> -->`. For example:
   *
   * ```
   * <!-- BEGIN <sectionId> -->
   * anything between these comments will be replaced
   * and new content will be here when the function returns
   * <!-- END <sectionId> -->
   * ```
   */
  sectionId: string
}): Promise<string> => {
  const getUpdatedContent = () => {
    const beginMarker = `<!-- BEGIN ${sectionId} -->`
    const endMarker = `<!-- END ${sectionId} -->`
    const sectionRegExp = new RegExp(`${escapeRegExp(beginMarker)}[\\s\\S]*?${escapeRegExp(endMarker)}`, 'g')

    const sectionExists = !!sectionRegExp.exec(markdown)
    if (sectionExists) {
      // section exists, so let's update it
      return markdown.replaceAll(sectionRegExp, `${beginMarker}\n\n${content}\n\n${endMarker}`)
    } else {
      switch (missing) {
        case 'insert':
          return `${markdown}\n${beginMarker}\n\n${content}\n\n${endMarker}\n`
        case 'skip':
          return markdown
        default:
          throw new Error(`Could not find section to update, and 'missing' was "${missing}. [sectionId=${sectionId}]`)
      }
    }
  }

  return Promise.resolve(getUpdatedContent())
}
