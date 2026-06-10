import type { LimitEntry } from '@twin-digital/grinbox-server'
import { RESOURCE_OPERATIONS, type Resource, limitDefinitionSchema } from '@twin-digital/grinbox-shared'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select.js'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table.js'
import { errorMessage } from '../../lib/api-error.js'
import { useCreateLimit, useDeleteLimit, useEditLimit, useLimits } from '../../lib/limits.js'

type Scope = 'per_window' | 'per_message'

const RESOURCES = Object.keys(RESOURCE_OPERATIONS) as [Resource, ...Resource[]]
const DEFAULT_RESOURCE: Resource = RESOURCES[0]

/**
 * Settings → Limits (ui-design.md "Settings"; M4 "Limit configuration UI: edit
 * per-Resource-operation caps"). A table of the User's Limits — each row carries
 * its resource.operation, scope, cap, window, and current usage — plus
 * Add / Edit-caps / Delete. Limits are the data model's non-negotiable safety
 * backstops, so the page frames them as caps, not preferences. Creates validate
 * client-side with `limitDefinitionSchema` (the same `scope`↔`window_seconds`
 * CHECK the server enforces) before the POST; structured API errors surface as
 * toasts.
 */
export function SettingsLimitsPage() {
  const { data: limits, isPending, isError, error } = useLimits()

  return (
    <section className='space-y-6'>
      <div>
        <h2 className='text-xl font-semibold'>Limits</h2>
        <p className='mt-1 text-sm text-muted-foreground'>
          Safety caps on Resource operation frequency — the non-negotiable backstops that keep a runaway Pipeline from
          spamming Pushover or burning the LLM budget. <span className='font-mono text-xs'>per_message</span> scope is
          how cross-Triage dedupe works for Notify.
        </p>
      </div>

      {isError ?
        <div className='rounded-lg border border-dashed border-border bg-card/40 px-6 py-12 text-center'>
          <p className='text-base font-medium'>Couldn't load Limits</p>
          <p className='mt-1 text-sm text-muted-foreground'>{error.message}</p>
        </div>
      : isPending ?
        <div className='space-y-3'>
          <div className='h-10 w-full animate-pulse rounded bg-muted' />
          <div className='h-10 w-full animate-pulse rounded bg-muted' />
          <div className='h-10 w-full animate-pulse rounded bg-muted' />
        </div>
      : <LimitsTable limits={limits} />}
    </section>
  )
}

function LimitsTable({ limits }: { limits: LimitEntry[] }) {
  return (
    <div className='space-y-4'>
      <div className='flex justify-end'>
        <AddLimitDialog />
      </div>

      {limits.length === 0 ?
        <div className='rounded-lg border border-dashed border-border bg-card/40 px-6 py-12 text-center'>
          <p className='text-xl font-medium'>:)</p>
          <p className='mt-2 text-sm text-muted-foreground'>
            No Limits defined. Add one to cap how often a Resource operation can run.
          </p>
        </div>
      : <div className='rounded-lg border border-border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Resource.op</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead className='text-right'>Cap</TableHead>
                <TableHead className='text-right'>Window</TableHead>
                <TableHead>Current usage</TableHead>
                <TableHead className='text-right'>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {limits.map((limit) => (
                <LimitRow key={limit.id} limit={limit} />
              ))}
            </TableBody>
          </Table>
        </div>
      }
    </div>
  )
}

function LimitRow({ limit }: { limit: LimitEntry }) {
  return (
    <TableRow>
      <TableCell className='font-mono text-xs'>
        {limit.resource}.{limit.operation}
      </TableCell>
      <TableCell>
        <Badge variant='outline'>{limit.scope}</Badge>
      </TableCell>
      <TableCell className='text-right tabular-nums'>{limit.max_count}</TableCell>
      <TableCell className='text-right font-mono text-xs'>
        {limit.window_seconds === null ? '—' : formatWindow(limit.window_seconds)}
      </TableCell>
      <TableCell className='text-sm text-muted-foreground'>{usageLabel(limit)}</TableCell>
      <TableCell>
        <div className='flex items-center justify-end gap-1'>
          <EditLimitDialog limit={limit} />
          <DeleteLimitDialog limit={limit} />
        </div>
      </TableCell>
    </TableRow>
  )
}

function usageLabel(limit: LimitEntry): string {
  if (limit.usage.kind === 'per_window') {
    return `${limit.usage.current_count} / ${limit.max_count}`
  }
  return `${limit.usage.messages_counted} Message${
    limit.usage.messages_counted === 1 ? '' : 's'
  } · max ${limit.usage.max_message_count} / ${limit.max_count}`
}

/** Compact window rendering: "600s", "10m", "1h", "1d". */
function formatWindow(seconds: number): string {
  if (seconds % 86_400 === 0) {
    return `${seconds / 86_400}d`
  }
  if (seconds % 3_600 === 0) {
    return `${seconds / 3_600}h`
  }
  if (seconds % 60 === 0) {
    return `${seconds / 60}m`
  }
  return `${seconds}s`
}

function AddLimitDialog() {
  const create = useCreateLimit()
  const [open, setOpen] = useState(false)
  const [resource, setResource] = useState<Resource>(DEFAULT_RESOURCE)
  const [operation, setOperation] = useState<string>(RESOURCE_OPERATIONS[DEFAULT_RESOURCE][0])
  const [scope, setScope] = useState<Scope>('per_window')
  const [maxCount, setMaxCount] = useState('10')
  const [windowSeconds, setWindowSeconds] = useState('600')
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})

  const operations = RESOURCE_OPERATIONS[resource] as readonly string[]

  const reset = () => {
    setResource(DEFAULT_RESOURCE)
    setOperation(RESOURCE_OPERATIONS[DEFAULT_RESOURCE][0])
    setScope('per_window')
    setMaxCount('10')
    setWindowSeconds('600')
    setErrors({})
  }

  const onResourceChange = (value: string) => {
    const next = value as Resource
    setResource(next)
    setOperation(RESOURCE_OPERATIONS[next][0])
  }

  const onSubmit = () => {
    const candidate = {
      resource,
      operation,
      scope,
      max_count: Number(maxCount),
      // Only per_window carries a window; per_message must be null (CHECK).
      window_seconds:
        scope === 'per_window' ?
          windowSeconds.trim() === '' ?
            null
          : Number(windowSeconds)
        : null,
    }
    const parsed = limitDefinitionSchema.safeParse(candidate)
    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? 'form')
        if (!next[field]) {
          next[field] = issue.message
        }
      }
      setErrors(next)
      return
    }
    setErrors({})
    create.mutate(parsed.data, {
      onSuccess: () => {
        toast.success('Limit added')
        setOpen(false)
        reset()
      },
      onError: (err) =>
        toast.error('Could not add Limit', {
          description: errorMessage(err),
        }),
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          reset()
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus />
          Add Limit
        </Button>
      </DialogTrigger>
      <DialogContent className='max-w-md'>
        <DialogHeader>
          <DialogTitle>Add Limit</DialogTitle>
        </DialogHeader>
        <DialogBody className='space-y-4'>
          <div className='space-y-2'>
            <Label htmlFor='limit-resource'>Resource</Label>
            <Select value={resource} onValueChange={onResourceChange}>
              <SelectTrigger id='limit-resource'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESOURCES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className='space-y-2'>
            <Label htmlFor='limit-operation'>Operation</Label>
            <Select value={operation} onValueChange={setOperation}>
              <SelectTrigger id='limit-operation'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {operations.map((op) => (
                  <SelectItem key={op} value={op}>
                    {op}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className='space-y-2'>
            <Label htmlFor='limit-scope'>Scope</Label>
            <Select
              value={scope}
              onValueChange={(v) => {
                setScope(v as Scope)
              }}
            >
              <SelectTrigger id='limit-scope'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='per_window'>per_window</SelectItem>
                <SelectItem value='per_message'>per_message</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className='space-y-2'>
            <Label htmlFor='limit-max'>Max count</Label>
            <Input
              id='limit-max'
              type='number'
              min={1}
              value={maxCount}
              onChange={(e) => {
                setMaxCount(e.target.value)
              }}
              aria-invalid={errors.max_count !== undefined}
            />
            {errors.max_count ?
              <p className='text-xs [color:var(--danger)]'>{errors.max_count}</p>
            : null}
          </div>

          {scope === 'per_window' ?
            <div className='space-y-2'>
              <Label htmlFor='limit-window'>Window (seconds)</Label>
              <Input
                id='limit-window'
                type='number'
                min={1}
                value={windowSeconds}
                onChange={(e) => {
                  setWindowSeconds(e.target.value)
                }}
                aria-invalid={errors.window_seconds !== undefined}
              />
              {errors.window_seconds ?
                <p className='text-xs [color:var(--danger)]'>{errors.window_seconds}</p>
              : <p className='text-xs text-muted-foreground'>The rolling window the cap applies over.</p>}
            </div>
          : <p className='text-xs text-muted-foreground'>
              <span className='font-mono'>per_message</span> Limits accumulate per Message and carry no window.
            </p>
          }
        </DialogBody>
        <DialogFooter>
          <Button
            variant='outline'
            onClick={() => {
              setOpen(false)
              reset()
            }}
          >
            Cancel
          </Button>
          <Button disabled={create.isPending} onClick={onSubmit}>
            {create.isPending ? 'Adding…' : 'Add Limit'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditLimitDialog({ limit }: { limit: LimitEntry }) {
  const edit = useEditLimit()
  const [open, setOpen] = useState(false)
  const [maxCount, setMaxCount] = useState(String(limit.max_count))
  const [windowSeconds, setWindowSeconds] = useState(limit.window_seconds === null ? '' : String(limit.window_seconds))
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})

  const isWindowed = limit.scope === 'per_window'

  const reset = () => {
    setMaxCount(String(limit.max_count))
    setWindowSeconds(limit.window_seconds === null ? '' : String(limit.window_seconds))
    setErrors({})
  }

  const onSubmit = () => {
    // Re-validate caps against the same CHECK the server enforces for this
    // Limit's (fixed) resource/operation/scope; only the caps are editable.
    const candidate = {
      resource: limit.resource,
      operation: limit.operation,
      scope: limit.scope,
      max_count: Number(maxCount),
      window_seconds:
        isWindowed ?
          windowSeconds.trim() === '' ?
            null
          : Number(windowSeconds)
        : null,
    }
    const parsed = limitDefinitionSchema.safeParse(candidate)
    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? 'form')
        if (!next[field]) {
          next[field] = issue.message
        }
      }
      setErrors(next)
      return
    }
    setErrors({})
    edit.mutate(
      {
        id: limit.id,
        max_count: parsed.data.max_count,
        window_seconds: parsed.data.window_seconds,
      },
      {
        onSuccess: () => {
          toast.success('Limit updated')
          setOpen(false)
        },
        onError: (err) =>
          toast.error('Could not update Limit', {
            description: errorMessage(err),
          }),
      },
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          reset()
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant='ghost' size='icon' aria-label={`Edit ${limit.resource}.${limit.operation} caps`}>
          <Pencil />
        </Button>
      </DialogTrigger>
      <DialogContent className='max-w-md'>
        <DialogHeader>
          <DialogTitle>Edit caps</DialogTitle>
        </DialogHeader>
        <DialogBody className='space-y-4'>
          <p className='font-mono text-xs text-muted-foreground'>
            {limit.resource}.{limit.operation} · {limit.scope}
          </p>
          <div className='space-y-2'>
            <Label htmlFor={`edit-max-${limit.id}`}>Max count</Label>
            <Input
              id={`edit-max-${limit.id}`}
              type='number'
              min={1}
              value={maxCount}
              onChange={(e) => {
                setMaxCount(e.target.value)
              }}
              aria-invalid={errors.max_count !== undefined}
            />
            {errors.max_count ?
              <p className='text-xs [color:var(--danger)]'>{errors.max_count}</p>
            : null}
          </div>
          {isWindowed ?
            <div className='space-y-2'>
              <Label htmlFor={`edit-window-${limit.id}`}>Window (seconds)</Label>
              <Input
                id={`edit-window-${limit.id}`}
                type='number'
                min={1}
                value={windowSeconds}
                onChange={(e) => {
                  setWindowSeconds(e.target.value)
                }}
                aria-invalid={errors.window_seconds !== undefined}
              />
              {errors.window_seconds ?
                <p className='text-xs [color:var(--danger)]'>{errors.window_seconds}</p>
              : null}
            </div>
          : null}
        </DialogBody>
        <DialogFooter>
          <Button
            variant='outline'
            onClick={() => {
              setOpen(false)
            }}
          >
            Cancel
          </Button>
          <Button disabled={edit.isPending} onClick={onSubmit}>
            {edit.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeleteLimitDialog({ limit }: { limit: LimitEntry }) {
  const remove = useDeleteLimit()

  const onConfirm = () => {
    remove.mutate(limit.id, {
      onSuccess: () => toast.success('Limit removed'),
      onError: (err) =>
        toast.error('Could not remove Limit', {
          description: errorMessage(err),
        }),
    })
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant='ghost'
          size='icon'
          className='text-muted-foreground hover:text-[color:var(--danger)]'
          aria-label={`Delete ${limit.resource}.${limit.operation} limit`}
        >
          <Trash2 />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove this Limit?</AlertDialogTitle>
          <AlertDialogDescription>
            Removing the cap on{' '}
            <span className='font-mono'>
              {limit.resource}.{limit.operation}
            </span>{' '}
            ({limit.scope}) lifts a safety backstop. Operations on this Resource will run unbounded until you add a
            Limit again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant='outline'>Cancel</Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button variant='destructive' onClick={onConfirm}>
              Remove
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
