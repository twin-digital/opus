export type LinkStatus =
  { state: 'connecting' } | { state: 'connected'; link: number } | { state: 'down'; link: number }

/** The text of the status line. */
export const statusText = (status: LinkStatus): string => {
  switch (status.state) {
    case 'connecting':
      return 'Connecting to the construct.'
    case 'connected':
      return `Connected (link ${String(status.link)}).`
    case 'down':
      return 'The construct is not reachable. The page tries again.'
  }
}
