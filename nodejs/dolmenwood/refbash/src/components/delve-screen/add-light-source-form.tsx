import React, { useEffect } from 'react'
import { Box } from 'ink'
import { useStore } from '../../store/store-context.js'
import { InputLayer } from '../../input/input-controller.js'
import { TextField } from '../form/text-field.js'
import { Form } from '../form/form.js'
import type { AddLightSourceData } from '@twin-digital/dolmenwood/chronicle'

interface Props {
  /**
   * Optional callback notified when the user cancels the form without submitting data.
   */
  onCancel?: () => void

  /**
   * Callback invoked wen the user submits valid form data.
   */
  onSubmit: (light: AddLightSourceData) => void
}

export const AddLightSourceForm = ({ onCancel, onSubmit }: Props) => {
  const ui = useStore().ui
  const input = ui.input

  useEffect(() => {
    const layer = new InputLayer('form:add-light-source')
    layer.addAction(
      'escape',
      () => {
        onCancel?.()
      },
      'cancel',
    )

    input.register(layer)
    return () => {
      input.remove(layer.id)
    }
  }, [input, onCancel])

  return (
    <Form
      onSubmit={(values) => {
        const light = values as { duration: string; heldBy: string; type: string }
        onSubmit({
          carriedBy: light.heldBy,
          maximumDuration: Number(light.duration),
          type: light.type,
        })
      }}
      submitMode='on-enter'
    >
      <Box alignItems='flex-end' flexDirection='row' gap={1} minHeight={2}>
        <TextField autoFocus={true} label='Held by:' name='heldBy' placeholder='Enter character name...' width={30} />
        <TextField defaultValue='torch' label={'Type:'} name='type' width={20} />
        <TextField
          defaultValue='6'
          label='Duration'
          name='duration'
          placeholder='turns'
          validate={(value) => {
            const asNumber = Number(value)
            if (isNaN(asNumber)) {
              return 'must be a number'
            }

            return asNumber > 0 ? null : 'must be >= 1'
          }}
          width={7}
        />
      </Box>
    </Form>
  )
}
