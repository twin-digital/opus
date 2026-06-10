import type { OperatorDetail, PipelineDetail, TagKeyRegistryEntry } from '@twin-digital/grinbox-server'
import type { OperatorTypeKey } from '@twin-digital/grinbox-shared'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react'
import { Fragment, useState } from 'react'
import { toast } from 'sonner'

import { Page } from '../../components/page.js'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../../components/ui/alert-dialog.js'
import { Badge } from '../../components/ui/badge.js'
import { Button } from '../../components/ui/button.js'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../components/ui/dialog.js'
import { Input } from '../../components/ui/input.js'
import { Label } from '../../components/ui/label.js'
import { Switch } from '../../components/ui/switch.js'
import { Textarea } from '../../components/ui/textarea.js'
import {
  errorMessage,
  useDeleteOperator,
  useDeletePipeline,
  usePipeline,
  useSetOperatorEnabled,
  useUpdateOperator,
  useUpdatePipeline,
} from '../../lib/pipelines.js'
import { AddOperatorButton } from './add-operator.js'
import { OperatorEditor } from './editors/operator-editor.js'
import { OPERATOR_TYPE_BY_KEY, type OperatorTypeMeta, blankConfigFor } from './operator-types.js'

/**
 * Pipeline detail (ui-design.md §4). Header (name / description / "active on N
 * Accounts" with edit + delete), the Operators list rendered in the API's
 * topological order with mutually-independent Operators bracketed by their
 * shared `group` index, the read-only tag-key registry, and the Add Operator
 * entry point. Per-Operator rows carry an enable/disable Switch, an Edit (opens
 * the Operator editor), and a Delete (AlertDialog). All mutations invalidate the
 * Pipeline query.
 */
export function PipelineDetailPage() {
  const { pipelineId } = useParams({ from: '/pipelines/$pipelineId' })
  const id = Number(pipelineId)
  const { data, isPending, isError, error } = usePipeline(id)

  return (
    <Page>
      <Link
        to='/pipelines'
        className='mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground'
      >
        <ArrowLeft className='h-4 w-4' />
        Back to Pipelines
      </Link>

      {isError ?
        <div className='rounded-lg border border-dashed border-border bg-card/40 px-6 py-12 text-center'>
          <p className='text-base font-medium'>Couldn't load this Pipeline</p>
          <p className='mt-1 text-sm text-muted-foreground'>{error.message}</p>
        </div>
      : isPending ?
        <div className='space-y-4'>
          <div className='h-8 w-64 animate-pulse rounded bg-muted' />
          <div className='h-40 w-full animate-pulse rounded-lg bg-muted' />
        </div>
      : <PipelineBody pipeline={data} id={id} />}
    </Page>
  )
}

function PipelineBody({ pipeline, id }: { pipeline: PipelineDetail; id: number }) {
  return (
    <div className='space-y-6'>
      <PipelineHeader pipeline={pipeline} id={id} />
      <OperatorsSection pipeline={pipeline} id={id} />
      <TagKeyRegistry registry={pipeline.tag_key_registry} />
      <div className='text-right'>
        <DeletePipelineDialog pipeline={pipeline} id={id} />
      </div>
    </div>
  )
}

function PipelineHeader({ pipeline, id }: { pipeline: PipelineDetail; id: number }) {
  const count = pipeline.active_account_count
  return (
    <header className='flex items-start justify-between gap-4'>
      <div>
        <h1 className='text-3xl font-semibold tracking-tight'>{pipeline.name}</h1>
        <p className='mt-1 text-sm text-muted-foreground'>
          {count === 0 ?
            <span className='[color:var(--warning)]'>Not assigned to any Account yet</span>
          : `Active on ${count} ${count === 1 ? 'Account' : 'Accounts'}`}
          {' · '}
          {pipeline.operators.length} {pipeline.operators.length === 1 ? 'Operator' : 'Operators'}
        </p>
        {pipeline.description ?
          <p className='mt-3 max-w-2xl text-sm text-foreground/80'>{pipeline.description}</p>
        : null}
      </div>
      <EditPipelineDialog pipeline={pipeline} id={id} />
    </header>
  )
}

function OperatorsSection({ pipeline, id }: { pipeline: PipelineDetail; id: number }) {
  return (
    <section className='space-y-3 rounded-lg border border-border bg-card p-4'>
      <div className='flex items-center justify-between'>
        <h2 className='text-xl font-semibold'>Operators</h2>
        <AddOperatorButton pipelineId={id} />
      </div>

      {pipeline.operators.length === 0 ?
        <p className='rounded-md border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground'>
          No Operators yet. Add one to start tagging and acting on Messages.
        </p>
      : <OperatorList operators={pipeline.operators} pipelineId={id} />}
    </section>
  )
}

/**
 * Renders Operators in the server's topological order, bracketing runs of
 * Operators that share a `group` index (mutually independent — they run in
 * parallel). A group with >1 member gets a left-margin violet bracket + an
 * "Independent — runs in parallel" caption; singletons render flat.
 */
function OperatorList({ operators, pipelineId }: { operators: readonly OperatorDetail[]; pipelineId: number }) {
  // Partition the already-sorted list into contiguous same-`group` runs.
  const groups: { group: number; members: OperatorDetail[] }[] = []
  for (const op of operators) {
    const last = groups.at(-1)
    if (last?.group === op.group) {
      last.members.push(op)
    } else {
      groups.push({ group: op.group, members: [op] })
    }
  }

  return (
    <div className='space-y-2'>
      {groups.map(({ members }) => {
        const first = members[0]
        if (members.length === 1) {
          return <OperatorRow key={first.id} operator={first} pipelineId={pipelineId} />
        }
        return (
          <div key={first.id} className='flex items-stretch gap-3'>
            <div className='w-1 flex-none rounded-full bg-violet-300 dark:bg-violet-600' />
            <div className='flex-1'>
              <div className='mb-1.5 text-[10px] uppercase tracking-wider [color:var(--primary)]'>
                Independent — runs in parallel
              </div>
              <div className='space-y-2'>
                {members.map((op) => (
                  <OperatorRow key={op.id} operator={op} pipelineId={pipelineId} />
                ))}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function OperatorRow({ operator, pipelineId }: { operator: OperatorDetail; pipelineId: number }) {
  // The lookup is typed total over OperatorTypeKey, but `type_key` comes from
  // the server, so an unknown key is still possible at runtime.
  const meta = (OPERATOR_TYPE_BY_KEY as Partial<Record<string, OperatorTypeMeta>>)[operator.type_key]
  const Icon = meta?.icon
  const setEnabled = useSetOperatorEnabled(pipelineId)
  const remove = useDeleteOperator(pipelineId)
  const update = useUpdateOperator(pipelineId)
  const [editing, setEditing] = useState(false)

  const outputs = operator.contract?.outputs ?? []

  const onToggle = (enabled: boolean) => {
    setEnabled.mutate(
      { operatorId: operator.id, enabled },
      {
        onSuccess: () => toast.success(enabled ? 'Operator enabled' : 'Operator disabled'),
        onError: (err) =>
          toast.error('Could not update Operator', {
            description: errorMessage(err),
          }),
      },
    )
  }

  return (
    <div className='flex items-center gap-3 rounded-md border border-border p-2.5'>
      {Icon ?
        <Icon className='h-4 w-4 shrink-0 text-muted-foreground' />
      : null}
      <div className='min-w-0 flex-1'>
        <div className='flex items-center gap-2 text-sm font-medium'>
          {operator.name}
          {!operator.enabled ?
            <Badge variant='outline' className='text-xs'>
              disabled
            </Badge>
          : null}
        </div>
        <div className='text-xs text-muted-foreground'>
          {meta?.label ?? operator.type_key}
          {outputs.length > 0 ?
            <>
              {' · produces '}
              {outputs.map((o, i) => (
                <Fragment key={o.key}>
                  {i > 0 ? ', ' : ''}
                  <span className='font-mono'>{o.key}</span>
                </Fragment>
              ))}
            </>
          : null}
        </div>
      </div>

      <span className='flex items-center gap-1.5 text-xs text-muted-foreground'>
        <Switch
          checked={operator.enabled}
          onCheckedChange={onToggle}
          disabled={setEnabled.isPending}
          aria-label={`${operator.enabled ? 'Disable' : 'Enable'} ${operator.name}`}
        />
        {operator.enabled ? 'on' : 'off'}
      </span>

      <Button
        variant='ghost'
        size='icon'
        aria-label={`Edit ${operator.name}`}
        onClick={() => {
          setEditing(true)
        }}
      >
        <Pencil />
      </Button>

      <DeleteOperatorDialog
        operatorName={operator.name}
        pending={remove.isPending}
        onConfirm={() => {
          remove.mutate(operator.id, {
            onSuccess: () => toast.success('Operator deleted'),
            onError: (err) =>
              toast.error('Could not delete Operator', {
                description: errorMessage(err),
              }),
          })
        }}
      />

      {editing ?
        <OperatorEditor
          open
          onOpenChange={(o) => {
            if (!o) {
              setEditing(false)
            }
          }}
          mode='edit'
          typeKey={operator.type_key as OperatorTypeKey}
          pipelineId={pipelineId}
          initialName={operator.name}
          // Seed from the Operator's stored config so editing pre-populates its
          // current settings; fall back to the type's blank config only if the
          // read API couldn't parse the stored JSON.
          initialConfig={operator.config ?? blankConfigFor(operator.type_key as OperatorTypeKey)}
          onSave={async ({ name, config }) => {
            await update.mutateAsync({ operatorId: operator.id, name, config })
            toast.success('Operator saved')
          }}
        />
      : null}
    </div>
  )
}

function TagKeyRegistry({ registry }: { registry: readonly TagKeyRegistryEntry[] }) {
  return (
    <section className='rounded-lg border border-border bg-card p-4'>
      <h3 className='mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
        Tag-key registry{' '}
        <span className='font-normal normal-case text-muted-foreground/70'>
          (read-only · derived from enabled Operator outputs)
        </span>
      </h3>
      {registry.length === 0 ?
        <p className='text-xs text-muted-foreground'>
          No output Tags declared yet. Add a Tagger to populate the registry.
        </p>
      : <div className='flex flex-wrap gap-1.5'>
          {registry.map((entry) => (
            <span
              key={`${entry.key}-${entry.producer_operator_id}`}
              className='inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs'
              title={entry.value_enum.join(' · ')}
            >
              <span className='font-mono font-medium'>{entry.key}</span>
              <span className='text-muted-foreground'>
                {entry.value_enum.length} {entry.value_enum.length === 1 ? 'value' : 'values'}
              </span>
            </span>
          ))}
        </div>
      }
    </section>
  )
}

function EditPipelineDialog({ pipeline, id }: { pipeline: PipelineDetail; id: number }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(pipeline.name)
  const [description, setDescription] = useState(pipeline.description ?? '')
  const update = useUpdatePipeline(id)

  const onSave = () => {
    const trimmed = name.trim()
    if (trimmed.length === 0) {
      return
    }
    update.mutate(
      {
        name: trimmed,
        description: description.trim() === '' ? null : description.trim(),
      },
      {
        onSuccess: () => {
          toast.success('Pipeline updated')
          setOpen(false)
        },
        onError: (err) =>
          toast.error('Could not update Pipeline', {
            description: errorMessage(err),
          }),
      },
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) {
          setName(pipeline.name)
          setDescription(pipeline.description ?? '')
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant='outline' size='sm'>
          <Pencil />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className='max-w-md grid-rows-[auto_auto_auto]'>
        <DialogHeader>
          <DialogTitle>Edit Pipeline</DialogTitle>
        </DialogHeader>
        <DialogBody className='space-y-4'>
          <div className='space-y-2'>
            <Label htmlFor='edit-name'>Name</Label>
            <Input
              id='edit-name'
              value={name}
              onChange={(e) => {
                setName(e.target.value)
              }}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='edit-description'>Description</Label>
            <Textarea
              id='edit-description'
              value={description}
              onChange={(e) => {
                setDescription(e.target.value)
              }}
            />
          </div>
        </DialogBody>
        <DialogFooter className='sm:justify-end'>
          <Button
            variant='outline'
            onClick={() => {
              setOpen(false)
            }}
          >
            Cancel
          </Button>
          <Button onClick={onSave} disabled={name.trim().length === 0 || update.isPending}>
            {update.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeleteOperatorDialog({
  operatorName,
  pending,
  onConfirm,
}: {
  operatorName: string
  pending: boolean
  onConfirm: () => void
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant='ghost'
          size='icon'
          disabled={pending}
          aria-label={`Delete ${operatorName}`}
          className='[color:var(--danger)]'
        >
          <Trash2 />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {operatorName}?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the Operator from the Pipeline. Tags it has already produced stay on their Messages; future
            Triages won't run it. This can't be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant='outline'>Cancel</Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button variant='destructive' onClick={onConfirm}>
              Delete
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function DeletePipelineDialog({ pipeline, id }: { pipeline: PipelineDetail; id: number }) {
  const remove = useDeletePipeline(id)
  const navigate = useNavigate()
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant='ghost' className='[color:var(--danger)]'>
          <Trash2 />
          Delete Pipeline
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {pipeline.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            {pipeline.active_account_count > 0 ?
              `This Pipeline is active on ${pipeline.active_account_count} Account(s); those Accounts will stop being triaged until you assign another Pipeline. `
            : ''}
            This removes the Pipeline and all its Operators. This can't be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant='outline'>Cancel</Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              variant='destructive'
              onClick={() => {
                remove.mutate(undefined, {
                  onSuccess: () => {
                    toast.success('Pipeline deleted')
                    void navigate({ to: '/pipelines' })
                  },
                  onError: (err) =>
                    toast.error('Could not delete Pipeline', {
                      description: errorMessage(err),
                    }),
                })
              }}
            >
              Delete
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
