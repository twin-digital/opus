/**
 * The classes that the text input and the text area share.
 */
export const textControlClass = [
  'block w-full min-w-0 rounded-sm border border-control-border bg-ground px-2 py-[5px] text-control text-fg',
  'placeholder:text-fg-muted',
  'enabled:st-hover:border-fg-muted',
  'enabled:st-focus:border-maker-text enabled:st-focus:shadow-[inset_0_0_0_1px_var(--maker-text)] enabled:st-focus:outline-0 enabled:st-focus:outline-transparent',
  'read-only:enabled:border-dashed read-only:enabled:bg-transparent read-only:enabled:text-fg-muted',
  'aria-invalid:border-danger-text',
  'aria-invalid:enabled:st-hover:border-danger-text',
  'aria-invalid:enabled:st-focus:border-danger-text aria-invalid:enabled:st-focus:shadow-[inset_0_0_0_1px_var(--danger-text)]',
  'disabled:opacity-50',
].join(' ')
