import TextInput from 'ink-text-input'
import { Panel } from '../panel.js'
import { FormField, type FormFieldProps } from './form-field.js'

type TextInputProps = Parameters<typeof TextInput>[0]
type Props = TextInputProps & {
  /**
   * Whether this field is focused by default.
   */
  autoFocus?: boolean

  /**
   * True if the input value has an error.
   * @defaultValue false
   */
  hasError?: boolean

  isFocused?: boolean

  /**
   * Width (in characters) of the input field.
   */
  width?: number
}

export type TextFieldProps = Omit<FormFieldProps, 'children'> & Omit<Props, 'onChange' | 'value'>

const WrappedTextField = ({ hasError = false, isFocused = false, width, ...textInputProps }: Props) => {
  const state =
    isFocused ? 'focus'
    : hasError ? 'error'
    : undefined

  return (
    <Panel state={state} type='field' width={width} minHeight={1}>
      <TextInput {...textInputProps} focus={isFocused} />
    </Panel>
  )
}

export const TextField = ({ autoFocus, defaultValue, label, name, validate, ...rest }: TextFieldProps) => {
  return (
    <FormField autoFocus={autoFocus} defaultValue={defaultValue} label={label} name={name} validate={validate}>
      {({ error, isFocused, setValue, value }) => (
        <WrappedTextField
          {...rest}
          hasError={error !== null}
          isFocused={isFocused}
          onChange={setValue}
          value={value ?? ''}
        />
      )}
    </FormField>
  )
}
