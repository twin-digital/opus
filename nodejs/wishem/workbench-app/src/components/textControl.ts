/**
 * The focus and error classes that the text controls and the select share.
 */
export const controlStateClass = [
  'enabled:st-focus:border-maker-text enabled:st-focus:shadow-[inset_0_0_0_1px_var(--maker-text)] enabled:st-focus:outline-0 enabled:st-focus:outline-transparent',
  'aria-invalid:border-danger-text',
  'aria-invalid:enabled:st-hover:border-danger-text',
  'aria-invalid:enabled:st-focus:border-danger-text aria-invalid:enabled:st-focus:shadow-[inset_0_0_0_1px_var(--danger-text)]',
].join(' ')

/**
 * The classes that the text input and the text area share.
 */
export const textControlClass = [
  'block w-full min-w-0 rounded-sm border border-control-border bg-ground px-2 py-[5px] text-control text-fg',
  'placeholder:text-fg-muted',
  'enabled:st-hover:border-fg-muted',
  controlStateClass,
  'read-only:enabled:border-dashed read-only:enabled:bg-transparent read-only:enabled:text-fg-muted',
  'disabled:opacity-50',
].join(' ')
