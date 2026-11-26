import { createContext, useContext, useId, type ReactNode } from 'react'

export interface FieldProps {
  label: string
  /**
   * Puts the control in the error state.
   */
  error?: string
  /**
   * One control. An `id` from the caller on the control replaces the identifier of the field, and the label then does not name the control.
   */
  children: ReactNode
}

interface FieldContextValue {
  controlId: string
  errorId: string | undefined
}

const FieldContext = createContext<FieldContextValue | null>(null)

/**
 * A label above one control, and an optional error message below it.
 */
export const Field = ({ label, error, children }: FieldProps) => {
  const id = useId()
  const hasError = error !== undefined && error !== ''
  const errorId = hasError ? `${id}-error` : undefined
  return (
    <FieldContext value={{ controlId: id, errorId }}>
      <div className='grid gap-1'>
        <label htmlFor={id} className='text-control font-medium'>
          {label}
        </label>
        {children}
        {hasError && (
          <p id={errorId} className='text-small break-words text-danger-text'>
            {error}
          </p>
        )}
      </div>
    </FieldContext>
  )
}

export interface FieldControl {
  id: string | undefined
  'aria-describedby': string | undefined
  'aria-invalid': true | undefined
}

/**
 * Merges the field of the control, if it has one, with its own `id` and `invalid`.
 * An `id` of the caller replaces the identifier of the field, and the label then does not name the control.
 */
export const useFieldControl = (own: { id?: string; invalid?: boolean; 'aria-describedby'?: string }): FieldControl => {
  const field = useContext(FieldContext)
  const describedBy = [own['aria-describedby'], field?.errorId].filter((part) => part !== undefined && part !== '')
  return {
    id: own.id ?? field?.controlId,
    'aria-describedby': describedBy.length > 0 ? describedBy.join(' ') : undefined,
    'aria-invalid': own.invalid === true || field?.errorId !== undefined ? true : undefined,
  }
}
