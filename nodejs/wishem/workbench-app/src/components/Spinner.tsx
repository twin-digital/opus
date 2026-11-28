/**
 * The spinning mark of a busy control. It is not a catalog component: it has no specimen of its own in the style
 * guide, and a button or a prompt box draws it.
 */
export const Spinner = () => (
  <span
    aria-hidden='true'
    data-spinner=''
    className='mr-1.5 inline-block size-[11px] animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none'
  />
)
