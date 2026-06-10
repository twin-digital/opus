import type { OperatorTypeKey } from '@twin-digital/grinbox-shared'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '../../components/ui/button.js'
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog.js'
import { errorMessage, useCreateOperator } from '../../lib/pipelines.js'
import { OperatorEditor } from './editors/operator-editor.js'
import { OPERATOR_TYPES } from './operator-types.js'

/**
 * Add Operator flow (ui-design.md §4). The button opens a type-picker modal
 * listing every registered Operator type (label + brief description). Picking a
 * type opens the {@link OperatorEditor} seeded with that type's blank config;
 * saving runs the create mutation, which invalidates the Pipeline query.
 */
export function AddOperatorButton({ pipelineId }: { pipelineId: number }) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [chosen, setChosen] = useState<OperatorTypeKey | null>(null)
  const create = useCreateOperator(pipelineId)

  return (
    <>
      <Button
        onClick={() => {
          setPickerOpen(true)
        }}
      >
        <Plus />
        Add Operator
      </Button>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className='max-w-xl grid-rows-[auto_minmax(0,1fr)]'>
          <DialogHeader>
            <DialogTitle>Add Operator</DialogTitle>
          </DialogHeader>
          <DialogBody className='space-y-2'>
            {OPERATOR_TYPES.map((t) => {
              const Icon = t.icon
              return (
                <button
                  key={t.typeKey}
                  type='button'
                  className='flex w-full items-start gap-3 rounded-md border border-border p-3 text-left transition-colors hover:bg-accent'
                  onClick={() => {
                    setChosen(t.typeKey)
                    setPickerOpen(false)
                  }}
                >
                  <Icon className='mt-0.5 h-5 w-5 shrink-0 text-muted-foreground' />
                  <div>
                    <div className='flex items-center gap-2 text-sm font-medium'>
                      {t.label}
                      <span className='text-xs font-normal text-muted-foreground'>{t.kind}</span>
                    </div>
                    <p className='mt-0.5 text-xs text-muted-foreground'>{t.description}</p>
                  </div>
                </button>
              )
            })}
          </DialogBody>
        </DialogContent>
      </Dialog>

      {chosen ?
        <OperatorEditor
          open
          onOpenChange={(o) => {
            if (!o) {
              setChosen(null)
            }
          }}
          mode='create'
          typeKey={chosen}
          pipelineId={pipelineId}
          initialName=''
          onSave={async ({ name, config }) => {
            await create.mutateAsync({ name, type_key: chosen, config })
            toast.success('Operator added')
          }}
        />
      : null}
    </>
  )
}

export { errorMessage }
