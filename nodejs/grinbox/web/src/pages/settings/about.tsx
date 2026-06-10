import { Mail, Server, Sparkles } from 'lucide-react'

import { useHealth } from '../../lib/health.js'

/**
 * Settings → About (ui-design.md "Settings"). App branding + the daemon build
 * version (from `/healthz`), a short description, and reference links. Static-ish
 * and on-brand — the "grin" tone. Only the version is live; the rest is fixed
 * copy until the daemon exposes more build/runtime metadata.
 */
export function SettingsAboutPage() {
  const { data: health, isPending, isError } = useHealth()

  const version =
    isPending ? '…'
    : isError || !health.version ? 'unknown'
    : health.version

  return (
    <section className='space-y-8'>
      <div className='flex items-center gap-3'>
        <div className='flex h-10 w-10 items-center justify-center rounded-md bg-gradient-to-br from-violet-500 to-violet-700 font-semibold text-white'>
          G
        </div>
        <div>
          <h2 className='text-base font-semibold'>Grinbox</h2>
          <p className='text-xs text-muted-foreground'>Self-hosted email triage · daemon + SPA</p>
        </div>
      </div>

      <p className='max-w-prose text-sm text-muted-foreground'>
        Grinbox watches your mailboxes, runs each Message through your Pipelines, and tags, notifies, and files things
        the way you would — so the inbox stops being a to-do list you have to re-read every morning. Everything runs on
        your own box; nothing leaves it except the calls you configure.
      </p>

      <section>
        <h3 className='mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground'>Build</h3>
        <dl className='grid grid-cols-[160px_1fr] gap-y-2 text-sm'>
          <dt className='text-muted-foreground'>Version</dt>
          <dd className='font-mono' data-testid='about-version'>
            {version}
          </dd>
          <dt className='text-muted-foreground'>Runtime</dt>
          <dd>Daemon + SPA · self-hosted</dd>
        </dl>
      </section>

      <section className='border-t border-border pt-6'>
        <h3 className='mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground'>Providers</h3>
        <ul className='space-y-2 text-sm'>
          <li className='flex items-center justify-between'>
            <span className='flex items-center gap-2'>
              <Mail className='h-4 w-4 text-muted-foreground' />
              Gmail
            </span>
            <span className='text-xs text-muted-foreground'>supported</span>
          </li>
          <li className='flex items-center justify-between text-muted-foreground'>
            <span className='flex items-center gap-2'>
              <Server className='h-4 w-4' />
              IMAP
            </span>
            <span className='text-xs'>post-MVP</span>
          </li>
          <li className='flex items-center justify-between'>
            <span className='flex items-center gap-2'>
              <Sparkles className='h-4 w-4 text-muted-foreground' />
              Bedrock (LLM)
            </span>
            <span className='text-xs text-muted-foreground'>supported</span>
          </li>
        </ul>
      </section>

      <section className='border-t border-border pt-6'>
        <h3 className='mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground'>Reference</h3>
        <ul className='space-y-1.5 text-sm'>
          <li>
            <a href='/docs/architecture.md' className='text-violet-600 hover:underline dark:text-violet-400'>
              Architecture
            </a>
          </li>
          <li>
            <a href='/docs/ui-design.md' className='text-violet-600 hover:underline dark:text-violet-400'>
              UI design
            </a>
          </li>
          <li>
            <a href='/docs/glossary.md' className='text-violet-600 hover:underline dark:text-violet-400'>
              Glossary
            </a>
          </li>
        </ul>
      </section>
    </section>
  )
}
