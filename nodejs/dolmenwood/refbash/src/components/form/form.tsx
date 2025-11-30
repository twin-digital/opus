import React, { createContext, useContext, useState, useMemo, type ReactNode } from 'react'
import { useInput } from 'ink'
import { mapValues } from 'lodash-es'

interface Props {
  /**
   * Children to render inside the form.
   */
  children: ReactNode

  /**
   * Callback invoked when the form is submitted and validation has passed.
   * @param values All field values, as (fieldName, value) tuples
   */
  onSubmit: (values: Record<string, string>) => void | Promise<void>

  /**
   * Sets the mechanism by which the form is submitted:
   *
   * - manual: the "submit" method must be manually invoked
   * - on-enter: pressing the entier key will submit the form
   */
  submitMode?: 'manual' | 'on-enter'
}

/**
 * Validation function used to check if a value for an input field is valid. If the value is valid, will
 * return null. Otherwise, a human-readable message describing the error is returned.
 *
 * @param value Single value for the input field being validated
 * @params values Values for all form fields, as (fieldName, value) tuples
 */
export type FieldValidationFn = (value: string, values: Record<string, unknown>) => string | null

/**
 * Handle used to unregister a field from a form.
 */
type UnregisterFieldFn = () => void

/**
 * Function used to register a new field in a form.
 * @param name Name of the new field
 * @param validator Function which will validate this field, or null if no validation is needed
 */
export type RegisterFieldFn = (name: string, validator: FieldValidationFn | null) => UnregisterFieldFn

export interface FormContext {
  /**
   * Validation errors for the form stored as (fieldName, message) tuples.
   */
  errors: Record<string, string | null>

  /**
   * Flag indicating whether all field values are valid or not.
   */
  isValid: boolean

  /**
   * Registers a new field in the form, specifying the field name and its validation function.
   *
   * @returns a handle which removes the field from the form when invoked.
   */
  registerField: RegisterFieldFn

  /**
   * Saves a single named value in the form. This is a raw value entered by the user, and may not necessarily
   * pass validation.
   *
   * @param name Name of the field to set
   * @param value New value for the field
   * @param validate Whether to run validation or not. (In case the value is still being edited.) Default to true
   */
  setValue: (name: string, value: string, validate?: boolean) => void

  /**
   * Runs validation on the form. If the data is valid, will invoke the form's "onSubmit" callback with all
   * field values. Returns true if a valid form is submitted, and false otherwise.
   */
  submit: () => boolean

  /**
   * Unvalidated values saved by each field, stored as (fieldName, value) tuples.
   */
  values: Record<string, string | undefined>
}

const FormContext = createContext<FormContext | null>(null)

export const useFormContext = () => useContext(FormContext)

export const Form = ({ children, onSubmit, submitMode = 'manual' }: Props) => {
  const [values, setValues] = useState<Record<string, string | undefined>>({})
  const [errors, setErrors] = useState<Record<string, string | null>>({})
  const [validators, setValidators] = useState<Record<string, FieldValidationFn | null>>({})

  const setValue = (name: string, value: string, shouldValidate = false) => {
    setValues((v) => ({ ...v, [name]: value }))

    setErrors((e) => {
      const validator = validators[name]
      if (!shouldValidate || !validator) {
        return e
      }
      const error = validator(value, values)
      return { ...e, [name]: error ?? null }
    })
  }

  const registerField = (name: string, validate: FieldValidationFn | null) => {
    setValidators((v) => ({ ...v, [name]: validate }))

    // could also initialize values/errors here
    return () => {
      setValidators((v) => {
        const copy = { ...v }
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete copy[name]
        return copy
      })
      setValues((v) => {
        const copy = { ...v }
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete copy[name]
        return copy
      })
      setErrors((e) => {
        const copy = { ...e }
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete copy[name]
        return copy
      })
    }
  }

  const isValid = Object.values(errors).every((e) => !e)

  const submit = () => {
    // Run full validation pass before submit
    const validationErrors: Record<string, string | null> = {}
    let allValid = true

    for (const [name, validator] of Object.entries(validators)) {
      if (validator) {
        const value = values[name] ?? ''
        const error = validator(value, values)
        validationErrors[name] = error
        if (error) {
          allValid = false
        }
      } else {
        validationErrors[name] = null
      }
    }

    // Update errors state with validation results
    setErrors(validationErrors)

    if (!allValid) {
      return false
    }

    void onSubmit(mapValues(values, (value) => value ?? ''))
    return true
  }

  // Example: Enter submits the form
  useInput((_, key) => {
    if (submitMode === 'on-enter' && key.return) {
      submit()
    }
  })

  const ctxValue = useMemo(
    () => ({
      values,
      errors,
      setValue,
      registerField,
      submit,
      isValid,
    }),
    [values, errors, isValid],
  )

  return <FormContext.Provider value={ctxValue}>{children}</FormContext.Provider>
}
