import React from 'react'
import { useFormField, type FormFieldContext } from './hooks/use-form-field.js'
import { Panel } from '../panel.js'
import { StyledText } from '../styled-text.js'
import { useFocus } from '../../hooks/use-focus.js'

export interface FormFieldControlProps extends FormFieldContext {
  /**
   * Whether this field is focused or not.
   */
  isFocused: boolean
}

export interface FormFieldProps {
  /**
   * Whether this field should be focused by default
   */
  autoFocus?: boolean

  /**
   * Render-prop for the actual input component
   **/
  children: (field: FormFieldControlProps) => React.ReactNode

  defaultValue?: string

  label: string
  name: string
  validate?: (value: string, values: Record<string, unknown>) => string | null
}

export const FormField = ({ autoFocus = false, name, label, defaultValue, validate, children }: FormFieldProps) => {
  const field = useFormField({ name, defaultValue, validate })
  const { isFocused } = useFocus({
    autoFocus,
    onBlur: () => {
      if (field.value !== undefined) {
        field.setValue(field.value, true)
      }
    },
  })

  const { error } = field

  return (
    <Panel alignItems='flex-end' flexDirection='row' columnGap={1}>
      {label && (
        <Panel>
          <StyledText type='label'>{label}</StyledText>
        </Panel>
      )}

      <Panel flexDirection='column'>
        {/* Error line */}
        {error && (
          <Panel>
            <StyledText type='error'>{error}</StyledText>
          </Panel>
        )}

        {/* Actual input */}
        <Panel>
          {children({
            ...field,
            isFocused,
          })}
        </Panel>
      </Panel>
    </Panel>
  )
}
