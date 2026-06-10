/**
 * The execution seam for Operators: the read-only view an Operator gets of a
 * Message, the metered Resource-client interfaces it calls, and the
 * `run`/registration shapes that compose onto `@twin-digital/grinbox-shared`'s declarative
 * registry.
 *
 * This file is the contract S4 (real metered clients) and S7 (the worker) build
 * against. It deliberately defines *all* metered client interfaces now — they
 * are the seam — even though only some are exercised this wave.
 */

import type {
  Contract,
  OperatorConfigFor,
  OperatorTypeKey,
  Resource,
  ResourceOpResult,
} from '@twin-digital/grinbox-shared'
import type { z } from 'zod'
import type { MessagesTable } from '../db/schema.js'

/**
 * The raw Message fields an Operator sees. Read-only projection of the
 * `messages` table (see {@link MessagesTable}), with header/thread access
 * normalized for Operator use:
 *  - `headers` is the parsed `headers_json` (lowercased header name → value),
 *    or an empty map when the Message has no stored headers.
 *  - `thread` carries the Provider's `thread_membership` output (architecture.md
 *    "Provider") when the Message is part of a Thread: the backend thread id,
 *    whether the Message is a reply within its Thread (`isReply`), and the
 *    Thread's Message count (`messageCount`). It is `null` when the Message is
 *    not in a Thread, and may be absent entirely until S5's Gmail Provider
 *    populates it — Operators must tolerate `null`.
 *
 * The full Message is always available to every Operator — there is no
 * per-field input declaration (architecture.md "Operator model").
 */
export interface MessageView {
  readonly id: number
  readonly accountId: number
  readonly backendMessageId: string
  readonly from: string | null
  /**
   * The sender email address parsed from the raw `from` header, lowercased
   * (e.g. `foo@bar.com`); `""` when the header is absent or unparseable. On a
   * header with multiple addresses, the first is taken. `from` itself stays the
   * raw header — use `from_email` for an exact-address match.
   */
  readonly from_email: string
  /**
   * The sender domain parsed from the raw `from` header, lowercased (the part
   * after `@`, e.g. `bar.com`); `""` when there is no parseable address/domain.
   */
  readonly from_domain: string
  readonly to: string | null
  readonly subject: string | null
  readonly snippet: string | null
  readonly bodyText: string | null
  readonly bodyHtml: string | null
  readonly receivedAt: number | null
  readonly headers: ReadonlyMap<string, string>
  readonly thread: {
    readonly backendThreadId: string | null
    /** Whether this Message is a reply within its Thread. */
    readonly isReply: boolean
    /** Number of Messages in the Thread. */
    readonly messageCount: number
  } | null
}

/**
 * Extracts the first email address from a raw `From`/`To`-style header value.
 * Handles the `Display Name <addr@dom>` form and the bare `addr@dom` form, and
 * takes the first address when several are present. Returns `{ email, domain }`
 * lowercased, with `""` for either part that can't be parsed.
 */
export function parseAddress(raw: string | null | undefined): {
  email: string
  domain: string
} {
  if (!raw) {
    return { email: '', domain: '' }
  }
  // Prefer the angle-bracketed address (`Display Name <addr@dom>`); else fall
  // back to the first bare `addr@dom` token. Take the first address only.
  const bracketed = /<([^<>]+)>/.exec(raw)
  const candidate = bracketed ? bracketed[1] : (raw.split(',')[0] ?? '')
  const m = /[^\s<>,"@]+@[^\s<>,"@]+/.exec(candidate)
  if (!m) {
    return { email: '', domain: '' }
  }
  const email = m[0].toLowerCase()
  const at = email.lastIndexOf('@')
  const domain = at >= 0 && at < email.length - 1 ? email.slice(at + 1) : ''
  return { email, domain }
}

/**
 * Projects a `messages` row into the read-only {@link MessageView} an Operator
 * sees. `headers_json` is parsed best-effort: a malformed blob yields an empty
 * header map rather than throwing (a bad header cache must not fail a Triage).
 */
export function messageViewFromRow(row: MessagesTable): MessageView {
  const headers = new Map<string, string>()
  if (row.headers_json) {
    try {
      const parsed: unknown = JSON.parse(row.headers_json)
      if (parsed && typeof parsed === 'object') {
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof v === 'string') {
            headers.set(k.toLowerCase(), v)
          }
        }
      }
    } catch {
      // Malformed header cache: treat as no headers.
    }
  }
  const { email: fromEmail, domain: fromDomain } = parseAddress(row.from_header)
  return {
    id: row.id as unknown as number,
    accountId: row.account_id,
    backendMessageId: row.backend_message_id,
    from: row.from_header,
    from_email: fromEmail,
    from_domain: fromDomain,
    to: row.to_header,
    subject: row.subject,
    snippet: row.snippet,
    bodyText: row.body_text,
    bodyHtml: row.body_html,
    receivedAt: row.received_at,
    headers,
    thread:
      row.backend_thread_id ?
        // `isReply` / `messageCount` come from the Provider's
        // `thread_membership` output (populated once S5's Gmail Provider lands);
        // the stored row carries only the backend thread id for now.
        {
          backendThreadId: row.backend_thread_id,
          isReply: false,
          messageCount: 0,
        }
      : null,
  }
}

// --- Metered Resource clients (the seam; S4 implements the real ones) ---
//
// One typed method per Resource operation in `RESOURCE_OPERATIONS`, each
// returning `Promise<ResourceOpResult<T>>`. The client encapsulates Limit
// checks, retry policy, metering, and event accumulation (pipeline-runtime.md
// "Resource clients and operation outcomes"); the Operator only ever sees the
// discriminated result.

/** Token / cost accounting returned alongside a successful LLM invocation. */
export interface LlmUsage {
  readonly inputTokens: number
  readonly outputTokens: number
}

export interface LlmInvokeArgs {
  readonly modelId: string
  readonly prompt: string
  /** Optional max output tokens; the client picks a default otherwise. */
  readonly maxTokens?: number
}

/** Bedrock LLM client — used by LLM Tagger (O2) and Digest delivery. */
export interface LlmBedrockClient {
  invoke_model(args: LlmInvokeArgs): Promise<ResourceOpResult<{ text: string; usage: LlmUsage }>>
}

export interface PushoverSendArgs {
  readonly title?: string
  readonly message: string
  /** Optional supplementary URL shown on the notification (Pushover `url`). */
  readonly url?: string
  /** Display text for {@link url} (Pushover `url_title`); ignored without `url`. */
  readonly url_title?: string
}

/** Pushover client — used by Notify (O4). */
export interface PushoverClient {
  send_notification(args: PushoverSendArgs): Promise<ResourceOpResult<{ message_id: string }>>
}

export interface GmailApplyLabelArgs {
  readonly backendMessageId: string
  readonly label: string
}

export interface GmailSendArgs {
  readonly to: string
  readonly subject: string
  readonly body: string
}

export interface GmailFetchArgs {
  readonly backendMessageId: string
}

export interface GmailListArgs {
  readonly query: string
}

/**
 * Gmail client — used by Apply Category (`apply_label`), Digest delivery
 * (`send_message`), and the Provider/poll path (`fetch_metadata`,
 * `list_messages`). Every declared operation in `RESOURCE_OPERATIONS.gmail_api`
 * has a method here.
 */
export interface GmailClient {
  apply_label(args: GmailApplyLabelArgs): Promise<ResourceOpResult<{ applied: boolean }>>
  send_message(args: GmailSendArgs): Promise<ResourceOpResult<{ message_id: string }>>
  fetch_metadata(args: GmailFetchArgs): Promise<ResourceOpResult<{ headers: Record<string, string> }>>
  list_messages(args: GmailListArgs): Promise<ResourceOpResult<{ ids: string[] }>>
}

/**
 * Map from a declared {@link Resource} to its metered-client interface. The
 * `resources` object handed to an Operator's `run` is a subset of this keyed by
 * exactly the Resources the type declares in its Contract.
 */
export interface ResourceClients {
  llm_bedrock: LlmBedrockClient
  pushover_api: PushoverClient
  gmail_api: GmailClient
}

/**
 * Factory the dispatcher calls once per declared Resource to obtain its metered
 * client. Dependency-injected so S4's real clients OR a test fake plug in
 * without `runOperator` knowing which. The `operations` argument is the
 * declared operation set for that Resource (from the Contract) — the real
 * client exposes only those; the fake may honor or ignore it.
 *
 * The factory is also where the `signal` / `onEvent` / `onUsage` wiring from
 * pipeline-runtime.md's `buildContext` lands: the worker closes over those when
 * it builds the factory, so `runOperator` itself stays free of accumulator
 * plumbing.
 */
export type MakeResourceClient = <R extends Resource>(resource: R, operations: readonly string[]) => ResourceClients[R]

/**
 * What an Operator's `run` receives. `config` is the type's parsed config;
 * `tags` are the input Tags in the current Triage's scope (key → value);
 * `resources` holds only the metered clients for the Resources the type
 * declares; `signal` is the Operator-timeout AbortSignal threaded into every
 * client.
 */
export interface OperatorRunInput<K extends OperatorTypeKey> {
  readonly config: OperatorConfigFor<K>
  readonly message: MessageView
  readonly tags: ReadonlyMap<string, string>
  readonly resources: Partial<ResourceClients>
  readonly signal: AbortSignal
}

/**
 * What an Operator's `run` returns: only its output Tags. Side effects
 * (notifications, labels, sends) go through the metered clients, which
 * accumulate their own events/usage; the run never reports them here.
 */
export interface OperatorRunResult {
  readonly tags: readonly { key: string; value: string }[]
}

/**
 * The full per-type registration record: `@twin-digital/grinbox-shared`'s declarative
 * members (`configSchema`, `contractFromConfig`) plus the server-side
 * behavioral members (`code_version`, `run`,
 * `extractCredentialRefsFromOperatorConfig`).
 *
 * `code_version` is a monotonic string starting at `'1'` for every built-in
 * (see registry.ts for the convention). It identifies which code path a
 * snapshotted `triage_operator_runs.type_code_version` dispatches into.
 */
export interface OperatorType<K extends OperatorTypeKey = OperatorTypeKey> {
  readonly type_key: K
  readonly code_version: string
  readonly configSchema: z.ZodType<OperatorConfigFor<K>>
  readonly contractFromConfig: (config: OperatorConfigFor<K>) => Contract
  readonly run: (input: OperatorRunInput<K>) => Promise<OperatorRunResult>
  /**
   * The set of `credential_id` values this Operator's `config` references, used
   * to reconcile `operator_credential_references` at Operator save (data-model
   * "operator_credential_references"). Pure over the parsed config.
   */
  readonly extractCredentialRefsFromOperatorConfig: (config: OperatorConfigFor<K>) => number[]
}
