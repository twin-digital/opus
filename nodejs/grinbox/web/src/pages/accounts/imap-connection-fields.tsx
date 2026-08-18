import type { ImapConnectionSecurity } from '@grinbox/shared'
import { useId } from 'react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ImapLogin } from '@/lib/imap'

/**
 * What an IMAP Account is configured with (d-ioso3voc): the server's host and
 * port, whether the connection is encrypted from the start or upgraded after
 * connecting, a username, and a password the user obtained from their provider.
 *
 * The same fields add an Account and repair one — repairing restates the whole
 * connection, not the password alone (d-r3ogwkv7, d-mcdtvppm) — so the form is
 * one component and the password is the only field a repair opens empty.
 *
 * There is no certificate-verification control here, and there will not be:
 * grinbox verifies the certificate the server presents and nothing the user
 * configures waives it (d-lru4i8rp).
 */

/** The conventional port for each protection, filled in when it is chosen. */
const CONVENTIONAL_PORT: Record<ImapConnectionSecurity, number> = {
  tls: 993,
  starttls: 143,
}

export const SECURITY_LABELS: Record<ImapConnectionSecurity, string> = {
  tls: 'Encrypted from the start (TLS)',
  starttls: 'Upgraded after connecting (STARTTLS)',
}

/** A blank connection, as the add form opens. */
export function blankLogin(): ImapLogin {
  return { host: '', port: CONVENTIONAL_PORT.tls, security: 'tls', username: '', password: '' }
}

/** Whether the draft is complete enough to attempt a login. */
export function loginComplete(login: ImapLogin): boolean {
  return (
    login.host.trim().length > 0 &&
    Number.isInteger(login.port) &&
    login.port >= 1 &&
    login.port <= 65535 &&
    login.username.length > 0 &&
    login.password.length > 0
  )
}

export function ImapConnectionFields({
  value,
  onChange,
  passwordHint,
}: {
  value: ImapLogin
  onChange: (next: ImapLogin) => void
  passwordHint?: string
}) {
  const hostId = useId()
  const portId = useId()
  const securityId = useId()
  const userId = useId()
  const passwordId = useId()

  return (
    <div className='space-y-4'>
      <div className='grid gap-4 sm:grid-cols-[1fr_8rem]'>
        <div className='space-y-2'>
          <Label htmlFor={hostId}>Server</Label>
          <Input
            id={hostId}
            autoComplete='off'
            placeholder='imap.example.com'
            value={value.host}
            onChange={(e) => {
              onChange({ ...value, host: e.target.value })
            }}
          />
        </div>
        <div className='space-y-2'>
          <Label htmlFor={portId}>Port</Label>
          <Input
            id={portId}
            inputMode='numeric'
            value={String(value.port)}
            onChange={(e) => {
              onChange({ ...value, port: Number(e.target.value) })
            }}
          />
        </div>
      </div>

      <div className='space-y-2'>
        <Label htmlFor={securityId}>Connection</Label>
        <Select
          value={value.security}
          onValueChange={(v) => {
            const security = v as ImapConnectionSecurity
            // Move the port with the choice only while it is still the other
            // mode's conventional one — a port the user typed is theirs.
            const port = value.port === CONVENTIONAL_PORT[value.security] ? CONVENTIONAL_PORT[security] : value.port
            onChange({ ...value, security, port })
          }}
        >
          <SelectTrigger id={securityId}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='tls'>{SECURITY_LABELS.tls}</SelectItem>
            <SelectItem value='starttls'>{SECURITY_LABELS.starttls}</SelectItem>
          </SelectContent>
        </Select>
        <p className='text-xs text-muted-foreground'>
          Grinbox verifies the server’s certificate either way, and refuses an Account whose certificate it cannot
          verify. There is no setting that turns that off.
        </p>
      </div>

      <div className='space-y-2'>
        <Label htmlFor={userId}>Username</Label>
        <Input
          id={userId}
          autoComplete='off'
          placeholder='you@example.com'
          value={value.username}
          onChange={(e) => {
            onChange({ ...value, username: e.target.value })
          }}
        />
      </div>

      <div className='space-y-2'>
        <Label htmlFor={passwordId}>Password</Label>
        <p className='text-xs text-muted-foreground'>
          {passwordHint ??
            'The password your provider gave you for mail apps. Grinbox stores it encrypted and never shows it again.'}
        </p>
        <Input
          id={passwordId}
          type='password'
          autoComplete='off'
          value={value.password}
          onChange={(e) => {
            onChange({ ...value, password: e.target.value })
          }}
        />
      </div>
    </div>
  )
}
