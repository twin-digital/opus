import { cooldownSettingSchema } from '@grinbox/shared'
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
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { errorMessage } from '@/lib/api-error'
import { type CooldownRow, useCooldowns, useCreateCooldown, useDeleteCooldown, useEditCooldown } from '@/lib/cooldowns'

/**
 * Settings → Notification cooldowns. A cooldown is the user's per-kind minimum
 * push interval (d-k3wq81vn): a push whose kind was delivered inside it is
 * suppressed rather than sent, so a burst of one kind costs one push
 * (r-lph86tsg). Unlike the Limits page's seeded caps, every row here is the
 * user's own — set, changed, and removed at will (d-6ptxams7); the seeded
 * limits on the push resource bind underneath and are configured on the
 * Limits page. Intervals are whole seconds, at least one (d-t6mhv3aq),
 * validated client-side with the shared `cooldownSettingSchema` before the
 * POST. A kind's name is fixed at create — renaming is delete + create
 * (d-7c6u5nfn) — so the edit dialog offers only the interval.
 */
export function SettingsCooldownsPage() {
  const { data, isPending, isError, error } = useCooldowns()

  return (
    <section className='space-y-6'>
      <div>
        <h2 className='text-xl font-semibold'>Notification cooldowns</h2>
        <p className='mt-1 text-sm text-muted-foreground'>
          The minimum interval between pushes of one notification kind. A push whose kind was delivered inside its
          cooldown is suppressed — the Triage still settles, and the Message records what was suppressed and which push
          it deferred to. A kind with no cooldown sends every time. Limits still cap the push Resource underneath.
        </p>
      </div>

      {isError ?
        <div className='rounded-lg border border-dashed border-border bg-card/40 px-6 py-12 text-center'>
          <p className='text-base font-medium'>Couldn't load cooldowns</p>
          <p className='mt-1 text-sm text-muted-foreground'>{error.message}</p>
        </div>
      : isPending ?
        <div className='space-y-3'>
          <div className='h-10 w-full animate-pulse rounded bg-muted' />
          <div className='h-10 w-full animate-pulse rounded bg-muted' />
        </div>
      : <CooldownsView cooldowns={data.cooldowns} kindsInUse={data.kinds_in_use} />}
    </section>
  )
}

function CooldownsView({ cooldowns, kindsInUse }: { cooldowns: CooldownRow[]; kindsInUse: string[] }) {
  const configured = new Set(cooldowns.map((c) => c.kind))
  const inUse = new Set(kindsInUse)
  // Kinds enabled Notify Operators send today that have no cooldown yet: the
  // Add dialog offers these so a cooldown can be set without retyping the name.
  const unconfigured = kindsInUse.filter((k) => !configured.has(k))

  return (
    <div className='space-y-4'>
      <div className='flex justify-end'>
        <AddCooldownDialog suggestions={unconfigured} />
      </div>

      {cooldowns.length === 0 ?
        <div className='rounded-lg border border-dashed border-border bg-card/40 px-6 py-12 text-center'>
          <p className='text-xl font-medium'>:)</p>
          <p className='mt-2 text-sm text-muted-foreground'>
            No cooldowns set — every push sends as soon as its Operator fires. Add one to space out a notification kind.
          </p>
        </div>
      : <div className='rounded-lg border border-border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kind</TableHead>
                <TableHead className='text-right'>Interval</TableHead>
                <TableHead className='text-right'>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cooldowns.map((cooldown) => (
                <CooldownRowView key={cooldown.id} cooldown={cooldown} inUse={inUse.has(cooldown.kind)} />
              ))}
            </TableBody>
          </Table>
        </div>
      }

      {unconfigured.length > 0 ?
        <p className='text-sm text-muted-foreground'>
          Kinds in use without a cooldown (these send every time):{' '}
          {unconfigured.map((kind) => (
            <span key={kind} className='mr-1.5 font-mono text-xs'>
              {kind}
            </span>
          ))}
        </p>
      : null}
    </div>
  )
}

/**
 * One cooldown. Every row carries edit + delete — the cooldown is the user's,
 * with none of the Limits table's locked seeded rows (d-6ptxams7). A kind no
 * enabled Operator sends today keeps its setting (d-k3wq81vn: the setting
 * outlives the Operators naming its kind); the badge just says it is dormant.
 */
function CooldownRowView({ cooldown, inUse }: { cooldown: CooldownRow; inUse: boolean }) {
  return (
    <TableRow>
      <TableCell className='font-mono text-xs'>
        {cooldown.kind}
        {inUse ? null : (
          <Badge variant='outline' className='ml-1.5'>
            No operator sends this kind
          </Badge>
        )}
      </TableCell>
      <TableCell className='text-right font-mono text-xs tabular-nums'>
        {formatInterval(cooldown.interval_seconds)}
      </TableCell>
      <TableCell>
        <div className='flex items-center justify-end gap-1'>
          <EditCooldownDialog cooldown={cooldown} />
          <DeleteCooldownDialog cooldown={cooldown} />
        </div>
      </TableCell>
    </TableRow>
  )
}

/** Compact interval rendering: "45s", "10m", "1h", "1d". */
function formatInterval(seconds: number): string {
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

/**
 * Validate a draft against the shared `cooldownSettingSchema` — the same
 * trimmed-non-empty-single-line kind and whole-seconds-at-least-one interval
 * the server enforces (d-p8xrn2ce, d-t6mhv3aq). A non-integer interval string
 * is turned into a failing candidate rather than rounded.
 */
function parseDraft(kind: string, interval: string) {
  const numeric = interval.trim() === '' ? Number.NaN : Number(interval)
  const candidate = {
    kind,
    interval_seconds: Number.isFinite(numeric) ? numeric : -1,
  }
  const parsed = cooldownSettingSchema.safeParse(candidate)
  if (parsed.success) {
    return { data: parsed.data, errors: {} as Partial<Record<'kind' | 'interval_seconds', string>> }
  }
  const errors: Partial<Record<'kind' | 'interval_seconds', string>> = {}
  for (const issue of parsed.error.issues) {
    const field = issue.path[0] === 'kind' ? 'kind' : 'interval_seconds'
    errors[field] ??= friendlyIssue(field, issue.message)
  }
  return { data: null, errors }
}

function friendlyIssue(field: 'kind' | 'interval_seconds', message: string): string {
  if (field === 'kind') {
    return message.includes('single line') ? message : 'A kind is a non-empty line of text.'
  }
  return 'The interval is a whole number of seconds, at least 1.'
}

function AddCooldownDialog({ suggestions }: { suggestions: string[] }) {
  const create = useCreateCooldown()
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState('')
  const [interval, setInterval] = useState('3600')
  const [errors, setErrors] = useState<Partial<Record<'kind' | 'interval_seconds', string>>>({})

  const reset = () => {
    setKind('')
    setInterval('3600')
    setErrors({})
  }

  const onSubmit = () => {
    const { data, errors: next } = parseDraft(kind, interval)
    if (data === null) {
      setErrors(next)
      return
    }
    setErrors({})
    create.mutate(data, {
      onSuccess: () => {
        toast.success('Cooldown added')
        setOpen(false)
        reset()
      },
      onError: (err) =>
        toast.error('Could not add cooldown', {
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
          Add cooldown
        </Button>
      </DialogTrigger>
      <DialogContent className='max-w-md'>
        <DialogHeader>
          <DialogTitle>Add cooldown</DialogTitle>
        </DialogHeader>
        <DialogBody className='space-y-4'>
          <div className='space-y-2'>
            <Label htmlFor='cooldown-kind'>Notification kind</Label>
            <p className='text-xs text-muted-foreground'>
              The kind name Notify Operators send, matched exactly as stored. One cooldown covers the kind across every
              Pipeline.
            </p>
            <Input
              id='cooldown-kind'
              value={kind}
              placeholder='Bank alerts'
              onChange={(e) => {
                setKind(e.target.value)
              }}
              aria-invalid={errors.kind !== undefined}
            />
            {errors.kind ?
              <p className='text-xs [color:var(--danger)]'>{errors.kind}</p>
            : null}
            {suggestions.length > 0 ?
              <div className='flex flex-wrap items-center gap-1.5 pt-1'>
                <span className='text-xs text-muted-foreground'>In use without a cooldown:</span>
                {suggestions.map((s) => (
                  <Button
                    key={s}
                    type='button'
                    variant='outline'
                    size='sm'
                    className='h-6 px-2 font-mono text-xs'
                    onClick={() => {
                      setKind(s)
                    }}
                  >
                    {s}
                  </Button>
                ))}
              </div>
            : null}
          </div>

          <div className='space-y-2'>
            <Label htmlFor='cooldown-interval'>Interval (seconds)</Label>
            <Input
              id='cooldown-interval'
              type='number'
              min={1}
              step={1}
              value={interval}
              onChange={(e) => {
                setInterval(e.target.value)
              }}
              aria-invalid={errors.interval_seconds !== undefined}
            />
            {errors.interval_seconds ?
              <p className='text-xs [color:var(--danger)]'>{errors.interval_seconds}</p>
            : <p className='text-xs text-muted-foreground'>
                Whole seconds, at least 1. A push of this kind inside the interval is suppressed and defers to the one
                already delivered.
              </p>
            }
          </div>
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
            {create.isPending ? 'Adding…' : 'Add cooldown'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditCooldownDialog({ cooldown }: { cooldown: CooldownRow }) {
  const edit = useEditCooldown()
  const [open, setOpen] = useState(false)
  const [interval, setInterval] = useState(String(cooldown.interval_seconds))
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setInterval(String(cooldown.interval_seconds))
    setError(null)
  }

  const onSubmit = () => {
    const { data, errors } = parseDraft(cooldown.kind, interval)
    if (data === null) {
      setError(errors.interval_seconds ?? 'The interval is a whole number of seconds, at least 1.')
      return
    }
    setError(null)
    edit.mutate(
      { id: cooldown.id, interval_seconds: data.interval_seconds },
      {
        onSuccess: () => {
          toast.success('Cooldown updated')
          setOpen(false)
        },
        onError: (err) =>
          toast.error('Could not update cooldown', {
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
        <Button variant='ghost' size='icon' aria-label={`Edit ${cooldown.kind} cooldown`}>
          <Pencil />
        </Button>
      </DialogTrigger>
      <DialogContent className='max-w-md'>
        <DialogHeader>
          <DialogTitle>Edit cooldown</DialogTitle>
        </DialogHeader>
        <DialogBody className='space-y-4'>
          {/* The kind is fixed at create; renaming is delete + create (d-7c6u5nfn). */}
          <p className='font-mono text-xs text-muted-foreground'>{cooldown.kind}</p>
          <div className='space-y-2'>
            <Label htmlFor={`edit-cooldown-${cooldown.id}`}>Interval (seconds)</Label>
            <Input
              id={`edit-cooldown-${cooldown.id}`}
              type='number'
              min={1}
              step={1}
              value={interval}
              onChange={(e) => {
                setInterval(e.target.value)
              }}
              aria-invalid={error !== null}
            />
            {error ?
              <p className='text-xs [color:var(--danger)]'>{error}</p>
            : <p className='text-xs text-muted-foreground'>
                Only the interval changes here — to rename the kind, remove this cooldown and add one under the new
                name.
              </p>
            }
          </div>
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

function DeleteCooldownDialog({ cooldown }: { cooldown: CooldownRow }) {
  const remove = useDeleteCooldown()

  const onConfirm = () => {
    remove.mutate(cooldown.id, {
      onSuccess: () => toast.success('Cooldown removed'),
      onError: (err) =>
        toast.error('Could not remove cooldown', {
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
          aria-label={`Delete ${cooldown.kind} cooldown`}
        >
          <Trash2 />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove this cooldown?</AlertDialogTitle>
          <AlertDialogDescription>
            Removing the cooldown on <span className='font-mono'>{cooldown.kind}</span> deletes the setting: every push
            of this kind sends as soon as its Operator fires. Limits on the push Resource still apply.
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
