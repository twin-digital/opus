import { Button, type ButtonVariant } from '../../../components/Button.js'
import { Forced } from '../../Forced.js'
import { StateMatrix } from '../../StateMatrix.js'

const variants: { variant: ButtonVariant; label: string }[] = [
  { variant: 'maker', label: 'Apply' },
  { variant: 'neutral', label: 'Cancel' },
  { variant: 'quiet', label: 'Reset' },
  { variant: 'danger', label: 'Delete' },
]

/**
 * The four button variants in each state.
 */
export const Buttons = () => (
  <StateMatrix
    columns={['Default', 'Hover', 'Active', 'Focus', 'Disabled', 'Loading']}
    rows={variants.map(({ variant, label }) => ({
      label: variant,
      cells: [
        <div key='default' data-testid={`button-${variant}-default`}>
          <Button variant={variant}>{label}</Button>
        </div>,
        <Forced key='hover' state='hover' testId={`button-${variant}-hover`}>
          <Button variant={variant}>{label}</Button>
        </Forced>,
        <Forced key='active' state='active' testId={`button-${variant}-active`}>
          <Button variant={variant}>{label}</Button>
        </Forced>,
        <Forced key='focus' state='focus' testId={`button-${variant}-focus`}>
          <Button variant={variant}>{label}</Button>
        </Forced>,
        <div key='disabled' data-testid={`button-${variant}-disabled`}>
          <Button variant={variant} disabled>
            {label}
          </Button>
        </div>,
        <div key='loading' data-testid={`button-${variant}-loading`}>
          <Button variant={variant} loading>
            {label}
          </Button>
        </div>,
      ],
    }))}
  />
)
