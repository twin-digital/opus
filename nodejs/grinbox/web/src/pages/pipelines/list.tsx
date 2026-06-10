import type { PipelineSummary } from '@twin-digital/grinbox-server'
import { Link, useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Page } from '../../components/page.js'
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table.js'
import { Textarea } from '../../components/ui/textarea.js'
import { errorMessage, useCreatePipeline, usePipelineList } from '../../lib/pipelines.js'

/**
 * Pipeline list (ui-design.md "Pipeline detail + Operator editor"): one row per
 * live Pipeline showing name, description, and "active on N Accounts". Rows link
 * to Pipeline detail; a create-pipeline action opens a small modal. First load
 * shows a skeleton (Query `isPending`); an empty list renders the first-run
 * empty state with the create CTA.
 */
export function PipelinesListPage() {
  const { data, isPending, isError, error } = usePipelineList()

  return (
    <Page>
      <header className='mb-8 flex items-start justify-between gap-4'>
        <div>
          <h1 className='text-3xl font-semibold tracking-tight'>Pipelines</h1>
          <p className='mt-2 text-sm text-muted-foreground'>
            The Operator chains that triage your mail. Assign one to an Account to put it to work.
          </p>
        </div>
        {data && data.length > 0 ?
          <CreatePipelineButton />
        : null}
      </header>

      {isError ?
        <ErrorState message={error.message} />
      : isPending ?
        <PipelinesSkeleton />
      : data.length === 0 ?
        <EmptyPipelines />
      : <PipelinesTable pipelines={data} />}
    </Page>
  )
}

function PipelinesTable({ pipelines }: { pipelines: readonly PipelineSummary[] }) {
  return (
    <div className='rounded-lg border border-border'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Pipeline</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className='text-right'>Active on</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pipelines.map((p) => (
            <PipelineRow key={p.id} pipeline={p} />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function PipelineRow({ pipeline }: { pipeline: PipelineSummary }) {
  return (
    <TableRow>
      <TableCell className='p-0 align-top'>
        <Link
          to='/pipelines/$pipelineId'
          params={{ pipelineId: String(pipeline.id) }}
          className='block px-4 py-3 font-medium hover:underline'
        >
          {pipeline.name}
        </Link>
      </TableCell>
      <TableCell className='max-w-md text-sm text-muted-foreground'>
        {pipeline.description ?? <span className='italic text-muted-foreground/70'>No description</span>}
      </TableCell>
      <TableCell className='text-right text-sm text-muted-foreground'>
        {pipeline.active_account_count === 0 ?
          <span className='[color:var(--warning)]'>0 Accounts</span>
        : `${pipeline.active_account_count} ${pipeline.active_account_count === 1 ? 'Account' : 'Accounts'}`}
      </TableCell>
    </TableRow>
  )
}

function CreatePipelineButton() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const create = useCreatePipeline()
  const navigate = useNavigate()

  const reset = () => {
    setName('')
    setDescription('')
  }

  const onCreate = () => {
    const trimmed = name.trim()
    if (trimmed.length === 0) {
      return
    }
    create.mutate(
      {
        name: trimmed,
        description: description.trim() === '' ? null : description.trim(),
      },
      {
        onSuccess: (id) => {
          toast.success('Pipeline created')
          setOpen(false)
          reset()
          void navigate({
            to: '/pipelines/$pipelineId',
            params: { pipelineId: String(id) },
          })
        },
        onError: (err) =>
          toast.error('Could not create Pipeline', {
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
        if (!o) {
          reset()
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus />
          New Pipeline
        </Button>
      </DialogTrigger>
      <DialogContent className='max-w-md grid-rows-[auto_auto_auto]'>
        <DialogHeader>
          <DialogTitle>New Pipeline</DialogTitle>
        </DialogHeader>
        <DialogBody className='space-y-4'>
          <div className='space-y-2'>
            <Label htmlFor='pipeline-name'>Name</Label>
            <Input
              id='pipeline-name'
              value={name}
              onChange={(e) => {
                setName(e.target.value)
              }}
              placeholder='Personal mail v2'
              autoFocus
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='pipeline-description'>Description</Label>
            <Textarea
              id='pipeline-description'
              value={description}
              onChange={(e) => {
                setDescription(e.target.value)
              }}
              placeholder='What this Pipeline does (optional).'
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
          <Button onClick={onCreate} disabled={name.trim().length === 0 || create.isPending}>
            {create.isPending ? 'Creating…' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EmptyPipelines() {
  return (
    <div className='flex min-h-72 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/40 px-6 py-16 text-center'>
      <p className='text-xl font-medium'>:)</p>
      <p className='mt-2 text-base font-medium'>No Pipelines yet</p>
      <p className='mt-1 max-w-md text-sm text-muted-foreground'>
        A Pipeline is the chain of Operators that tags and acts on your mail. Create one, add an Operator or two, then
        assign it to an Account.
      </p>
      <div className='mt-6'>
        <CreatePipelineButton />
      </div>
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  const { refetch } = usePipelineList()
  return (
    <div className='flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/40 px-6 py-12 text-center'>
      <p className='text-base font-medium'>Couldn't load Pipelines</p>
      <p className='mt-1 max-w-md text-sm text-muted-foreground'>{message}</p>
      <div className='mt-4'>
        <Button
          variant='outline'
          onClick={() => {
            void refetch()
          }}
        >
          Retry
        </Button>
      </div>
    </div>
  )
}

function PipelinesSkeleton() {
  return (
    <div className='rounded-lg border border-border'>
      <div className='divide-y divide-border'>
        {[0, 1, 2].map((i) => (
          <div key={i} className='flex items-center gap-4 px-4 py-4'>
            <div className='h-4 w-40 animate-pulse rounded bg-muted' />
            <div className='h-4 w-64 animate-pulse rounded bg-muted' />
            <div className='ml-auto h-4 w-16 animate-pulse rounded bg-muted' />
          </div>
        ))}
      </div>
    </div>
  )
}
