import { useEffect, useState } from 'react'
import { useFormContext, type FieldValidationFn } from '../form.js'

interface Options {
  /**
   * Optional efault value for this field.
   * @defaultValue no default
   */
  defaultValue?: string

  /**
   * Name of the field to register
   */
  name: string

  /**
   * Optional validation function to use for this field.
   */
  validate?: FieldValidationFn | null
}

export interface UseFormFieldResult {
  value: string | undefined
  error: string | null
  setValue: (value: string, shouldValidate?: boolean) => void
  submit: () => void
  inForm: boolean
}

export const useFormField = ({ name, validate = null, defaultValue }: Options): UseFormFieldResult => {
  const form = useFormContext()

  const [localValue, setLocalValue] = useState<string | undefined>(defaultValue)
  const [localError, setLocalError] = useState<string | null>(null)

  // Stand-alone mode: no parent <Form>
  if (!form) {
    const setValue = (v: string, shouldValidate = false) => {
      setLocalValue(v)
      if (shouldValidate && validate) {
        setLocalError(validate(v, {}))
      }
    }

    return {
      value: localValue,
      error: localError,
      setValue,
      submit: () => {
        // no-op submit in stand-alone mode
      },
      inForm: false,
    }
  }

  const { values, errors, setValue, registerField, submit } = form

  // register field on mount/unmount
  useEffect(() => {
    const unregister = registerField(name, validate)

    // initialize default value
    if (defaultValue !== undefined && values[name] === undefined) {
      setValue(name, defaultValue)
    }
    return unregister
  }, [name])

  return {
    value: values[name] ?? defaultValue,
    error: errors[name] ?? null,
    setValue: (v: string, shouldValidate = false) => {
      setValue(name, v, shouldValidate)
    },
    submit,
    inForm: true,
  }
}

export type FormFieldContext = ReturnType<typeof useFormField>
