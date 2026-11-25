export interface ZeroStateProps {
  /** A short mono label, for example "Workbench". */
  label: string
  /** One line of text, for example "Nothing to show yet." */
  message: string
}

/** Shows a label and a line of text in the center of the space that it gets. */
export const ZeroState = ({ label, message }: ZeroStateProps) => (
  <div className='grid h-full place-content-center gap-1.5 text-center'>
    <p className='font-mono text-label font-medium text-fg-muted uppercase'>{label}</p>
    <p className='text-ui text-fg-muted'>{message}</p>
  </div>
)
