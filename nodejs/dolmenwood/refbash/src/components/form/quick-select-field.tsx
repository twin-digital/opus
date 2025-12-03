import { useInput } from 'ink'
import { Panel } from '../panel.js'
import { StyledText } from '../styled-text.js'
import { FormField } from './form-field.js'

export interface QuickSelectOption {
  /**
   * Keypress which will select this option.
   */
  key: string

  /**
   * Optional label to display for this option
   * @defaultValue The `value` will be displayed
   */
  label?: string

  /**
   * Value to set in the form if this option is selected.
   */
  value: string
}

interface Props {
  /**
   * Whether the component is focused or not
   */
  isFocused?: boolean

  /**
   * Callback invoked when the value changes.
   */
  onChange?: (value: string) => void

  /**
   * Options which will be presented to the user.
   */
  options: QuickSelectOption[]

  /**
   * Current value of the input.
   */
  value?: string
}

export interface QuickSelectProps extends Props {
  /**
   * Whether this field is focused by default.
   */
  autoFocus?: boolean

  defaultValue?: string
  label: string
  name: string
}

const WrappedQuickSelectField = ({ isFocused, onChange, options, value }: Props) => {
  useInput((input) => {
    if (!isFocused) {
      return
    }

    const matchingOption = options.find((option) => option.key === input)
    if (matchingOption !== undefined && matchingOption.value !== value) {
      onChange?.(matchingOption.value)
    }
  })

  const renderOptions = () =>
    options.map(({ key, label, value: itemValue }) => {
      const selected = value === itemValue
      return (
        <Panel>
          <StyledText type={selected ? 'selected' : 'strong'}>{key}:</StyledText>
          <StyledText type={selected ? 'selected' : undefined}>{label}</StyledText>
        </Panel>
      )
    })

  return <Panel columnGap={2}>{renderOptions()}</Panel>
}

export const QuickSelectField = ({ autoFocus = false, defaultValue, label, name, ...rest }: QuickSelectProps) => {
  return (
    <FormField autoFocus={autoFocus} defaultValue={defaultValue} label={label} name={name}>
      {({ isFocused, setValue, value }) => (
        <WrappedQuickSelectField {...rest} isFocused={isFocused} onChange={setValue} value={value} />
      )}
    </FormField>
  )
}
