import { Select as BaseSelect } from '@base-ui/react/select'
import { useFieldControl } from './Field.js'
import { defined } from './native.js'
import { useThemeScopeElement } from './ThemeScope.js'
import { controlStateClass } from './textControl.js'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

type AriaProps = { [K in keyof React.AriaAttributes]?: React.AriaAttributes[K] }

export interface SelectProps extends AriaProps {
  options: readonly SelectOption[]
  /**
   * `undefined` shows the placeholder. A value that is not in `options` shows as text.
   */
  value: string | undefined
  /**
   * Reports a selection. The select keeps `value` until the caller gives a new one.
   */
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  /**
   * Puts the select in the error state.
   */
  invalid?: boolean
  /**
   * Holds the menu open or closed. With no `open`, the select holds the state.
   */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  id?: string
}

const triggerClass = [
  'relative flex w-full min-w-0 cursor-default items-center rounded-sm border border-control-border bg-ground',
  'py-[5px] pr-[26px] pl-2 text-left text-control text-fg',
  'data-placeholder:text-fg-muted',
  'not-data-popup-open:enabled:st-hover:border-fg-muted',
  controlStateClass,
  'data-popup-open:border-maker-text data-popup-open:shadow-[inset_0_0_0_1px_var(--maker-text)] data-popup-open:outline-0',
  'aria-invalid:data-popup-open:border-danger-text aria-invalid:data-popup-open:shadow-[inset_0_0_0_1px_var(--danger-text)]',
  'disabled:opacity-50',
].join(' ')

const itemClass = [
  'relative cursor-default rounded-sm py-[5px] pr-2 pl-6 break-words outline-0 select-none',
  'data-highlighted:bg-[color-mix(in_srgb,var(--fg)_9%,transparent)]',
  'data-disabled:cursor-not-allowed data-disabled:text-fg-muted data-disabled:opacity-60',
].join(' ')

/**
 * A select drawn by the catalog. It holds no value and no open state unless the caller leaves `open` out.
 * The menu is drawn in the nearest theme scope.
 */
export const Select = ({
  options,
  value,
  onChange,
  placeholder,
  disabled,
  invalid,
  open,
  onOpenChange,
  id,
  ...rest
}: SelectProps) => {
  const scope = useThemeScopeElement()
  const control = useFieldControl({ id, invalid, 'aria-describedby': rest['aria-describedby'] })
  const aria = Object.fromEntries(Object.entries(rest).filter(([name]) => name.startsWith('aria-')))
  const labelOf = (current: string) => options.find((option) => option.value === current)?.label ?? current

  return (
    <BaseSelect.Root
      items={options}
      value={value ?? null}
      onValueChange={(next) => {
        if (next !== null) {
          onChange(next)
        }
      }}
      disabled={disabled}
      open={open}
      onOpenChange={
        onOpenChange ?
          (next) => {
            onOpenChange(next)
          }
        : undefined
      }
      modal={false}
    >
      <BaseSelect.Trigger {...aria} {...defined(control)} className={triggerClass}>
        <BaseSelect.Value placeholder={placeholder} className='min-w-0 flex-1 truncate'>
          {(current: string | null) => (current === null ? placeholder : labelOf(current))}
        </BaseSelect.Value>
        <span
          aria-hidden='true'
          className='pointer-events-none absolute top-1/2 right-[9px] size-[6px] -translate-y-[70%] rotate-45 border-r-[1.5px] border-b-[1.5px] border-fg-muted'
        />
      </BaseSelect.Trigger>
      <BaseSelect.Portal container={scope ?? undefined}>
        <BaseSelect.Positioner
          sideOffset={4}
          alignItemWithTrigger={false}
          collisionAvoidance={{ side: 'none', align: 'shift', fallbackAxisSide: 'none' }}
          className='z-10 outline-0'
        >
          <BaseSelect.Popup className='w-(--anchor-width) rounded-md border border-line bg-surface p-1 text-control text-fg shadow-md outline-0'>
            <BaseSelect.List className='max-h-64 overflow-y-auto'>
              {options.map((option) => (
                <BaseSelect.Item
                  key={option.value}
                  value={option.value}
                  label={option.label}
                  disabled={option.disabled}
                  className={itemClass}
                >
                  <BaseSelect.ItemIndicator aria-hidden='true'>
                    <span className='absolute top-2 left-[9px] h-2 w-1 rotate-45 border-r-2 border-b-2 border-maker-text' />
                  </BaseSelect.ItemIndicator>
                  <BaseSelect.ItemText>{option.label}</BaseSelect.ItemText>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  )
}
