/**
 * Demo-seed script — fills a fresh State DB with a realistic dataset so a human
 * can boot the daemon and review a *populated* UI instead of the empty
 * first-run state (no User, no Accounts, no Messages).
 *
 * This is dev tooling, not part of the daemon. It writes rows directly (mostly
 * fully-settled Triages with their runs/events/tags) rather than driving the
 * live poll + execution loops, so the result is a static, good-looking snapshot
 * across all six UI areas: Dashboard, Inbox + Message detail, Pipelines,
 * Accounts, Activity, and Settings → Limits.
 *
 * ## Usage
 *
 *   # 1. Build the web SPA once (the daemon serves it as static assets):
 *   pnpm --filter @twin-digital/grinbox-web build
 *
 *   # 2. Seed a throwaway DB (32-byte key, base64- or hex-encoded). The key is
 *   #    only needed so the gmail_oauth credential can be stored and the account
 *   #    shows status "ok"; without it the seed still runs and the account shows
 *   #    "needs_auth".
 *   GRINBOX_TOKEN_ENC_KEY="$(head -c 32 /dev/urandom | base64)" \
 *     GRINBOX_DB_PATH=/tmp/demo.db \
 *     pnpm --filter @twin-digital/grinbox-server seed:demo
 *
 *   # 3. Boot the daemon against the same DB + key and open the UI:
 *   GRINBOX_TOKEN_ENC_KEY="<same key as above>" \
 *     GRINBOX_DB_PATH=/tmp/demo.db \
 *     pnpm --filter @twin-digital/grinbox-server dev
 *   # open http://localhost:8787
 *
 * The DB path comes from `--db <path>`, else `GRINBOX_DB_PATH`, else
 * `./grinbox.db`. The encryption key comes from `GRINBOX_TOKEN_ENC_KEY`
 * (base64- or hex-encoded, decoding to exactly 32 bytes); if unset, the
 * credential is skipped and the account reads "needs_auth".
 *
 * ## Idempotency
 *
 * The seed REFUSES to run against a DB that already has a User, unless `--reset`
 * is passed. `--reset` deletes every row from every application table (in FK
 * order) and reseeds from scratch, so re-running with `--reset` is safe and
 * deterministic.
 */

import { sql } from 'kysely'
import { makeEncryptor } from '../crypto/encryption.js'
import { openDatabase } from '../db/connection.js'
import { runMigrations } from '../db/migrator.js'
import type { DB } from '../db/schema.js'
import { seedDefaultLimits } from '../db/seed.js'
import { encryptTokenPayload } from '../oauth/token-store.js'
import { currentCodeVersion } from '../operators/registry.js'

// --- arg / env parsing ------------------------------------------------------

interface CliArgs {
  readonly dbPath: string
  readonly reset: boolean
}

function parseArgs(argv: readonly string[]): CliArgs {
  let dbPath: string | undefined
  let reset = false
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--reset') {
      reset = true
    } else if (arg === '--db') {
      dbPath = argv[i + 1]
      i++
    } else if (arg.startsWith('--db=')) {
      dbPath = arg.slice('--db='.length)
    }
  }
  const resolved = dbPath ?? process.env.GRINBOX_DB_PATH ?? './grinbox.db'
  return { dbPath: resolved, reset }
}

/** Decode the token-encryption key the same way config.ts does (hex or base64). */
function decodeKey(raw: string): Buffer | null {
  const trimmed = raw.trim()
  if (trimmed.length === 0) {
    return null
  }
  if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length % 2 === 0) {
    const buf = Buffer.from(trimmed, 'hex')
    if (buf.length > 0) {
      return buf
    }
  }
  const buf = Buffer.from(trimmed, 'base64')
  return buf.length > 0 ? buf : null
}

// --- demo content -----------------------------------------------------------

const DAY = 86_400
const HOUR = 3_600

/** Type code versions for the implemented Taggers and Action Operators. */
const LLM_CV = currentCodeVersion('llm_tagger')
const RULE_CV = currentCodeVersion('rule_based_tagger')
/**
 * Notify / Apply Category share a single demo code version. The demo Triages
 * snapshot their run rows here; some are marked `skipped` to illustrate the
 * Action no-op path (a gated-out `when`, or a per-Message Limit dedupe) that
 * leaves a Triage `partial`.
 */
const ACTION_CV = currentCodeVersion('notify')

interface DemoMessage {
  readonly backendId: string
  readonly threadId: string
  readonly from: string
  readonly subject: string
  readonly snippet: string
  /** Hours before `now` the message was received. */
  readonly hoursAgo: number
  readonly urgency: 'high' | 'normal' | 'low'
  readonly category: string
  readonly needsReply: 'yes' | 'no'
  /** A second account owns this message (so the Inbox spans 2 accounts). */
  readonly secondAccount?: boolean
  /** Mark this Triage `partial` (an action run skipped) rather than `completed`. */
  readonly partial?: boolean
  /** Emit a resource_op_limited event (Pushover window cap) on this Triage. */
  readonly limited?: boolean
  /** Emit a resource_op_failed event + a failed action run on this Triage. */
  readonly failed?: boolean
}

const CATEGORIES = ['Finance', 'Work', 'Travel', 'Shopping', 'Personal', 'Newsletters', 'Calendar']

const DEMO_MESSAGES: readonly DemoMessage[] = [
  {
    backendId: 'gm-1001',
    threadId: 'th-1001',
    from: 'YNAB <no-reply@youneedabudget.com>',
    subject: 'Your March budget is ready to review',
    snippet: 'You assigned $4,200 across 18 categories this month…',
    hoursAgo: 2,
    urgency: 'normal',
    category: 'Finance',
    needsReply: 'no',
    partial: true,
  },
  {
    backendId: 'gm-1002',
    threadId: 'th-1002',
    from: 'Dr. Patel Office <scheduling@northsidehealth.com>',
    subject: 'Appointment reminder: Thursday 9:15 AM',
    snippet: 'This is a reminder for your upcoming visit. Reply C to confirm…',
    hoursAgo: 4,
    urgency: 'high',
    category: 'Calendar',
    needsReply: 'yes',
    limited: true,
  },
  {
    backendId: 'gm-1003',
    threadId: 'th-1003',
    from: 'Amazon <ship-confirm@amazon.com>',
    subject: 'Your package has shipped',
    snippet: 'Arriving tomorrow by 8 PM. Track your order here…',
    hoursAgo: 6,
    urgency: 'low',
    category: 'Shopping',
    needsReply: 'no',
  },
  {
    backendId: 'gm-1004',
    threadId: 'th-1004',
    from: 'Jordan Lee <jordan.lee@acme.example>',
    subject: 'Re: Q2 roadmap — need your sign-off today',
    snippet: 'Hey, can you confirm the launch date before standup? Blocking…',
    hoursAgo: 7,
    urgency: 'high',
    category: 'Work',
    needsReply: 'yes',
    failed: true,
  },
  {
    backendId: 'gm-1005',
    threadId: 'th-1005',
    from: 'United Airlines <receipts@united.com>',
    subject: 'Your e-ticket and itinerary — SFO to BOS',
    snippet: 'Confirmation ABC123. Departs Friday 7:40 AM from gate 42…',
    hoursAgo: 10,
    urgency: 'normal',
    category: 'Travel',
    needsReply: 'no',
  },
  {
    backendId: 'gm-1006',
    threadId: 'th-1006',
    from: 'Stripe <receipts@stripe.com>',
    subject: 'Payment of $129.00 to Cloudflare',
    snippet: 'Your subscription renewed successfully. Invoice attached…',
    hoursAgo: 12,
    urgency: 'low',
    category: 'Finance',
    needsReply: 'no',
  },
  {
    backendId: 'gm-1007',
    threadId: 'th-1007',
    from: 'Mom <linda.k@example.com>',
    subject: 'Sunday dinner?',
    snippet: 'Are you and the kids free this weekend? Let me know what works…',
    hoursAgo: 14,
    urgency: 'normal',
    category: 'Personal',
    needsReply: 'yes',
    secondAccount: true,
  },
  {
    backendId: 'gm-1008',
    threadId: 'th-1008',
    from: 'GitHub <notifications@github.com>',
    subject: '[grinbox] CI failed on main',
    snippet: 'The build failed for commit 529967f. View the run logs…',
    hoursAgo: 16,
    urgency: 'high',
    category: 'Work',
    needsReply: 'no',
  },
  {
    backendId: 'gm-1009',
    threadId: 'th-1009',
    from: 'The Verge <newsletter@theverge.com>',
    subject: 'This week in tech: the stuff that mattered',
    snippet: 'Our editors round up the week. Plus: a deep dive on…',
    hoursAgo: 20,
    urgency: 'low',
    category: 'Newsletters',
    needsReply: 'no',
  },
  {
    backendId: 'gm-1010',
    threadId: 'th-1010',
    from: 'Chase <alerts@chase.com>',
    subject: 'Large purchase alert: $842.19',
    snippet: 'A purchase exceeding your alert threshold was authorized…',
    hoursAgo: 22,
    urgency: 'high',
    category: 'Finance',
    needsReply: 'no',
    secondAccount: true,
  },
  {
    backendId: 'gm-1011',
    threadId: 'th-1011',
    from: 'Calendly <no-reply@calendly.com>',
    subject: 'New event: 1:1 with Priya, Wed 3:00 PM',
    snippet: 'Priya scheduled a meeting with you. Add it to your calendar…',
    hoursAgo: 26,
    urgency: 'normal',
    category: 'Calendar',
    needsReply: 'no',
  },
  {
    backendId: 'gm-1012',
    threadId: 'th-1012',
    from: 'Airbnb <automated@airbnb.com>',
    subject: 'Your reservation in Portland is confirmed',
    snippet: 'Check-in Friday 3 PM. Your host left a note for you…',
    hoursAgo: 30,
    urgency: 'normal',
    category: 'Travel',
    needsReply: 'no',
  },
  {
    backendId: 'gm-1013',
    threadId: 'th-1013',
    from: 'Spotify <no-reply@spotify.com>',
    subject: 'Your December Wrapped is here',
    snippet: 'You listened to 41,203 minutes this year. See your top artists…',
    hoursAgo: 34,
    urgency: 'low',
    category: 'Newsletters',
    needsReply: 'no',
  },
  {
    backendId: 'gm-1014',
    threadId: 'th-1014',
    from: 'Sam Rivera <sam@contractor.example>',
    subject: 'Invoice #2204 — due in 7 days',
    snippet: 'Attached is the invoice for last month. Net 7 as usual…',
    hoursAgo: 38,
    urgency: 'normal',
    category: 'Finance',
    needsReply: 'yes',
    partial: true,
  },
  {
    backendId: 'gm-1015',
    threadId: 'th-1015',
    from: 'School District <notify@schools.example.org>',
    subject: 'Early dismissal Thursday — parent action needed',
    snippet: 'Please confirm pickup arrangements through the portal by Wed…',
    hoursAgo: 42,
    urgency: 'high',
    category: 'Personal',
    needsReply: 'yes',
  },
  {
    backendId: 'gm-1016',
    threadId: 'th-1016',
    from: 'LinkedIn <messages-noreply@linkedin.com>',
    subject: 'You appeared in 12 searches this week',
    snippet: 'See who is looking at your profile and grow your network…',
    hoursAgo: 46,
    urgency: 'low',
    category: 'Newsletters',
    needsReply: 'no',
    secondAccount: true,
  },
  {
    backendId: 'gm-1017',
    threadId: 'th-1017',
    from: 'Costco <orders@costco.com>',
    subject: 'Order ready for pickup',
    snippet: 'Your order is ready at the Foster City warehouse until Sunday…',
    hoursAgo: 50,
    urgency: 'normal',
    category: 'Shopping',
    needsReply: 'no',
  },
  {
    backendId: 'gm-1018',
    threadId: 'th-1018',
    from: 'Notion <team@mail.notion.so>',
    subject: 'Priya commented on "Launch checklist"',
    snippet: '"Can we move the cutover to Monday?" — see the thread…',
    hoursAgo: 54,
    urgency: 'normal',
    category: 'Work',
    needsReply: 'yes',
  },
  {
    backendId: 'gm-1019',
    threadId: 'th-1019',
    from: 'IRS <noreply@irs.gov.example>',
    subject: 'Important: action required on your account',
    snippet: 'We could not process your most recent filing. Respond by…',
    hoursAgo: 60,
    urgency: 'high',
    category: 'Finance',
    needsReply: 'yes',
    limited: true,
  },
  {
    backendId: 'gm-1020',
    threadId: 'th-1020',
    from: 'Strava <no-reply@strava.com>',
    subject: 'You earned a new achievement',
    snippet: 'Longest ride this month! Share it with your followers…',
    hoursAgo: 64,
    urgency: 'low',
    category: 'Newsletters',
    needsReply: 'no',
  },
  {
    backendId: 'gm-1021',
    threadId: 'th-1021',
    from: 'Priya Shah <priya@acme.example>',
    subject: 'Slides for tomorrow — final draft',
    snippet: 'Pushed the latest version. Take a look before the review…',
    hoursAgo: 70,
    urgency: 'normal',
    category: 'Work',
    needsReply: 'yes',
  },
  {
    backendId: 'gm-1022',
    threadId: 'th-1022',
    from: 'Delta <flightinfo@delta.com>',
    subject: 'Flight DL482 delayed 45 minutes',
    snippet: 'Your departure has been updated. New boarding time is…',
    hoursAgo: 76,
    urgency: 'high',
    category: 'Travel',
    needsReply: 'no',
    secondAccount: true,
  },
  {
    backendId: 'gm-1023',
    threadId: 'th-1023',
    from: 'Audible <no-reply@audible.com>',
    subject: 'Your monthly credit is available',
    snippet: 'Pick your next listen — recommendations based on your library…',
    hoursAgo: 82,
    urgency: 'low',
    category: 'Shopping',
    needsReply: 'no',
  },
  {
    backendId: 'gm-1024',
    threadId: 'th-1024',
    from: 'HOA Board <board@maplewood.example>',
    subject: 'Annual meeting agenda + proxy form',
    snippet: 'Please review the agenda and return your proxy if you cannot…',
    hoursAgo: 90,
    urgency: 'normal',
    category: 'Personal',
    needsReply: 'yes',
  },
]

// --- table reset ------------------------------------------------------------

/**
 * Every application table, in FK-safe delete order (children before parents).
 * `schema_migrations*` are intentionally excluded — the schema stays migrated.
 */
const TABLES_IN_DELETE_ORDER = [
  'triage_events',
  'tags',
  'current_triages',
  'triage_operator_runs',
  'triages',
  'limit_counters_window',
  'limit_counters_message',
  'operator_credential_references',
  'operators',
  'pipelines',
  'limits',
  'credentials',
  'messages',
  'accounts',
  'change_log',
  'users',
] as const

async function clearAllData(db: DB): Promise<void> {
  // Disable FK enforcement for the bulk wipe so delete order can't trip a
  // RESTRICT/NOT-NULL FK (e.g. operator_credential_references → credentials).
  // PRAGMA can't run inside a transaction, so it's toggled around the deletes.
  await sql`PRAGMA foreign_keys = OFF`.execute(db)
  try {
    for (const table of TABLES_IN_DELETE_ORDER) {
      await db.deleteFrom(table).execute()
    }
  } finally {
    await sql`PRAGMA foreign_keys = ON`.execute(db)
  }
}

// --- seeding ----------------------------------------------------------------

async function seed(db: DB, now: number, encKey: Buffer | null): Promise<void> {
  // 1. User + default Limits.
  const user = await db
    .insertInto('users')
    .values({ name: 'Demo User', email: 'demo@grinbox.local', created_at: now })
    .returning('id')
    .executeTakeFirstOrThrow()
  const userId = user.id
  await seedDefaultLimits(db, userId)

  // 2. Pipeline + operators (LLM Tagger → urgency+category, Rule-based Tagger →
  //    needs_reply, Notify, Apply Category). Distinct output keys + no declared
  //    inputs, so the set is structurally valid and renders a full tag-key
  //    registry.
  const pipeline = await db
    .insertInto('pipelines')
    .values({
      user_id: userId,
      name: 'Personal triage',
      description:
        'Tags urgency and category with an LLM, flags reply-needed by rule, notifies on high-urgency mail, and files a Gmail category.',
      created_at: now - 9 * DAY,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  const pipelineId = pipeline.id

  const llmConfig = {
    // Must be a key in the server's MODEL_INFERENCE_PROFILES (resources/bedrock.ts);
    // an unmapped id would make the seeded LLM Tagger throw at run time.
    model_id: 'anthropic.claude-haiku-4-5-20251001-v1:0',
    prompt_template:
      'You triage personal email. For this message, choose its urgency and a single category.\n\nFrom: {{from}}\nSubject: {{subject}}\nSnippet: {{snippet}}',
    outputs: [
      { tag_key: 'urgency', value_enum: ['high', 'normal', 'low'] },
      { tag_key: 'category', value_enum: CATEGORIES },
    ],
  }
  const ruleConfig = {
    output_tag_key: 'needs_reply',
    output_value_enum: ['yes', 'no'],
    rules: [
      { match: "subject contains '?'", output: 'yes' },
      { match: "from contains 'no-reply'", output: 'no' },
    ],
    fallback: { output: 'no' },
  }

  const llmOp = await db
    .insertInto('operators')
    .values({
      pipeline_id: pipelineId,
      name: 'Urgency + category (LLM)',
      type_key: 'llm_tagger',
      type_code_version: LLM_CV,
      config_json: JSON.stringify(llmConfig),
      enabled: 1,
      created_at: now - 9 * DAY,
      updated_at: now - 3 * DAY,
    })
    .returning('id')
    .executeTakeFirstOrThrow()

  const ruleOp = await db
    .insertInto('operators')
    .values({
      pipeline_id: pipelineId,
      name: 'Needs reply? (rule)',
      type_key: 'rule_based_tagger',
      type_code_version: RULE_CV,
      config_json: JSON.stringify(ruleConfig),
      enabled: 1,
      created_at: now - 9 * DAY,
      updated_at: now - 8 * DAY,
    })
    .returning('id')
    .executeTakeFirstOrThrow()

  // Notify action references the pushover credential created below.
  const notifyOp = await db
    .insertInto('operators')
    .values({
      pipeline_id: pipelineId,
      name: 'Push high-urgency mail',
      type_key: 'notify',
      type_code_version: ACTION_CV,
      // credentials_id is filled in after the pushover credential is inserted.
      config_json: '{}',
      enabled: 1,
      created_at: now - 8 * DAY,
      updated_at: now - 8 * DAY,
    })
    .returning('id')
    .executeTakeFirstOrThrow()

  const applyOp = await db
    .insertInto('operators')
    .values({
      pipeline_id: pipelineId,
      name: 'File Gmail category',
      type_key: 'apply_category',
      type_code_version: ACTION_CV,
      config_json: JSON.stringify({
        category_template: 'Grinbox/{{tag.category}}',
      }),
      enabled: 1,
      created_at: now - 8 * DAY,
      updated_at: now - 2 * DAY,
    })
    .returning('id')
    .executeTakeFirstOrThrow()

  // 3. Accounts (two gmail accounts), both assigned the pipeline.
  const primary = await db
    .insertInto('accounts')
    .values({
      user_id: userId,
      name: 'Personal Gmail',
      provider_type: 'gmail',
      active_pipeline_id: pipelineId,
      settings_json: JSON.stringify({ email: 'demo.user@gmail.com' }),
      poll_interval_seconds: 600,
      last_polled_at: now - 5 * 60,
      last_history_cursor: '99123456',
      created_at: now - 9 * DAY,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  const primaryAccountId = primary.id

  const secondary = await db
    .insertInto('accounts')
    .values({
      user_id: userId,
      name: 'Family Gmail',
      provider_type: 'gmail',
      active_pipeline_id: pipelineId,
      settings_json: JSON.stringify({ email: 'demo.family@gmail.com' }),
      poll_interval_seconds: 900,
      last_polled_at: now - 11 * 60,
      last_history_cursor: '88011223',
      created_at: now - 7 * DAY,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  const secondaryAccountId = secondary.id

  // 4. Pushover notification credential (user-scoped) — referenced by Notify.
  let pushoverCredId: number | null = null
  if (encKey) {
    const enc = makeEncryptor(encKey)
    const pushoverEnc = enc.encrypt(
      Buffer.from(
        JSON.stringify({
          app_token: 'demo-app-token',
          user_key: 'demo-user-key',
        }),
        'utf8',
      ),
    )
    const pushoverCred = await db
      .insertInto('credentials')
      .values({
        user_id: userId,
        account_id: null,
        kind: 'pushover',
        data_enc: pushoverEnc,
        created_at: now - 8 * DAY,
        updated_at: now - 8 * DAY,
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    pushoverCredId = pushoverCred.id

    // Now that we have a real credential id, wire it into the Notify config and
    // record the operator_credential_references row the save reconciler keeps.
    await db
      .updateTable('operators')
      .set({
        config_json: JSON.stringify({
          message_template: '{{tag.urgency}}: {{subject}}',
          credentials_id: pushoverCredId,
          when: { tag_key: 'urgency', equals: ['high'] },
        }),
      })
      .where('id', '=', notifyOp.id)
      .execute()
    await db
      .insertInto('operator_credential_references')
      .values({ operator_id: notifyOp.id, credential_id: pushoverCredId })
      .execute()
  } else {
    // No key: leave a structurally-valid Notify config with a placeholder ref.
    // The pipeline still renders; the Notify run is skipped in the demo Triages.
    await db
      .updateTable('operators')
      .set({
        config_json: JSON.stringify({
          message_template: '{{tag.urgency}}: {{subject}}',
          credentials_id: 1,
          when: { tag_key: 'urgency', equals: ['high'] },
        }),
      })
      .where('id', '=', notifyOp.id)
      .execute()
  }

  // 5. Per-account gmail_oauth credentials so the Accounts page reads "ok".
  //    Skipped entirely when no encryption key is configured (accounts then
  //    read "needs_auth", which is still a valid demo state).
  if (encKey) {
    const enc = makeEncryptor(encKey)
    for (const accountId of [primaryAccountId, secondaryAccountId]) {
      const payload = {
        refresh_token: `demo-refresh-${accountId}`,
        access_token: `demo-access-${accountId}`,
        access_token_expires_at: now + 3600,
        scopes: 'https://www.googleapis.com/auth/gmail.modify',
      }
      await db
        .insertInto('credentials')
        .values({
          user_id: userId,
          account_id: accountId,
          kind: 'gmail_oauth',
          data_enc: encryptTokenPayload(enc, payload),
          created_at: now - 8 * DAY,
          updated_at: now - 8 * DAY,
        })
        .execute()
    }
  }

  // 6. Messages + settled Triages (runs, events, tags, current_triages cache).
  let seq = 0
  for (const m of DEMO_MESSAGES) {
    const accountId = m.secondAccount ? secondaryAccountId : primaryAccountId
    const receivedAt = now - m.hoursAgo * HOUR
    const message = await db
      .insertInto('messages')
      .values({
        account_id: accountId,
        backend_message_id: m.backendId,
        backend_thread_id: m.threadId,
        from_header: m.from,
        to_header: 'Demo User <demo.user@gmail.com>',
        subject: m.subject,
        snippet: m.snippet,
        body_text: `${m.snippet}\n\n— (demo body for ${m.backendId})`,
        body_html: null,
        received_at: receivedAt,
        created_at: receivedAt,
        body_fetched_at: receivedAt + 5,
        headers_json: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    const messageId = message.id

    seq += 1
    await seedTriage(db, {
      messageId,
      pipelineId,
      userId,
      now,
      startedAt: receivedAt + 8,
      m,
      ops: {
        llm: llmOp.id,
        rule: ruleOp.id,
        notify: notifyOp.id,
        apply: applyOp.id,
      },
      configs: {
        llm: JSON.stringify(llmConfig),
        rule: JSON.stringify(ruleConfig),
        notify: JSON.stringify({
          message_template: '{{tag.urgency}}: {{subject}}',
          credentials_id: pushoverCredId ?? 1,
        }),
        apply: JSON.stringify({ category_template: 'Grinbox/{{tag.category}}' }),
      },
    })

    // A handful of messages get a second, earlier Triage (a prior pipeline run)
    // so the Message-detail history shows more than one entry.
    if (seq % 5 === 0) {
      await seedTriage(db, {
        messageId,
        pipelineId,
        userId,
        now,
        startedAt: receivedAt - 2 * DAY,
        triggeredBy: 'user_replay',
        m: { ...m, limited: false, failed: false, partial: false },
        ops: {
          llm: llmOp.id,
          rule: ruleOp.id,
          notify: notifyOp.id,
          apply: applyOp.id,
        },
        configs: {
          llm: JSON.stringify(llmConfig),
          rule: JSON.stringify(ruleConfig),
          notify: JSON.stringify({
            message_template: '{{tag.urgency}}: {{subject}}',
            credentials_id: pushoverCredId ?? 1,
          }),
          apply: JSON.stringify({ category_template: 'Grinbox/{{tag.category}}' }),
        },
      })
    }
  }

  // 7. Limit counters so Settings → Limits shows non-zero usage. Find the
  //    relevant limit ids by (resource, operation, scope) and seed a current
  //    window counter + a couple of per-message counters.
  await seedLimitUsage(db, userId, now)

  // 8. change_log: recent operator edits so the Dashboard "recent edits" card
  //    and the audit view have content. (Credential creates already logged via
  //    the live path are not used here; the seed writes operator-edit rows.)
  await db
    .insertInto('change_log')
    .values([
      {
        user_id: userId,
        actor_user_id: userId,
        entity_type: 'operator',
        entity_id: applyOp.id,
        action: 'updated',
        before_json: JSON.stringify({ category_template: 'Grinbox/Inbox' }),
        after_json: JSON.stringify({
          category_template: 'Grinbox/{{tag.category}}',
        }),
        recorded_at: now - 2 * DAY,
      },
      {
        user_id: userId,
        actor_user_id: userId,
        entity_type: 'operator',
        entity_id: llmOp.id,
        action: 'updated',
        before_json: JSON.stringify({ model_id: 'anthropic.claude-instant' }),
        after_json: JSON.stringify({ model_id: llmConfig.model_id }),
        recorded_at: now - 3 * DAY,
      },
      {
        user_id: userId,
        actor_user_id: userId,
        entity_type: 'operator',
        entity_id: notifyOp.id,
        action: 'enabled',
        before_json: null,
        after_json: JSON.stringify({ enabled: true }),
        recorded_at: now - 8 * DAY,
      },
      {
        user_id: userId,
        actor_user_id: userId,
        entity_type: 'pipeline',
        entity_id: pipelineId,
        action: 'created',
        before_json: null,
        after_json: JSON.stringify({ name: 'Personal triage' }),
        recorded_at: now - 9 * DAY,
      },
    ])
    .execute()
}

interface SeedTriageArgs {
  readonly messageId: number
  readonly pipelineId: number
  readonly userId: number
  readonly now: number
  readonly startedAt: number
  readonly triggeredBy?:
    | 'message_arrival'
    | 'user_replay'
    | 'user_reset_and_replay'
    | 'pipeline_changed'
    | 'scheduled_replay'
  readonly m: DemoMessage
  readonly ops: {
    llm: number
    rule: number
    notify: number
    apply: number
  }
  readonly configs: {
    llm: string
    rule: string
    notify: string
    apply: string
  }
}

/**
 * Insert one fully-settled Triage with its four operator runs, output tags,
 * triage_events, and the current_triages cache row (when this is the latest
 * Triage). The LLM + Rule runs complete; the action runs (Notify / Apply) are
 * `skipped` on a `partial`/failure path or `completed` otherwise, mirroring the
 * settlement table.
 */
async function seedTriage(db: DB, args: SeedTriageArgs): Promise<void> {
  const { messageId, pipelineId, ops, configs, m } = args
  const startedAt = args.startedAt
  const triggeredBy = args.triggeredBy ?? 'message_arrival'

  // A failure run or a skipped action run makes the Triage `partial`.
  const actionsCompleted = m.partial !== true && m.failed !== true
  const finalStatus = actionsCompleted ? 'completed' : 'partial'
  const endedAt = startedAt + 6

  const triage = await db
    .insertInto('triages')
    .values({
      message_id: messageId,
      pipeline_id: pipelineId,
      triggered_by: triggeredBy,
      actor_user_id: triggeredBy === 'message_arrival' ? null : args.userId,
      started_at: startedAt,
      ended_at: endedAt,
      status: finalStatus,
      error_summary: m.failed ? 'Notify failed: pushover_api.send_notification returned 503' : null,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  const triageId = triage.id

  // --- LLM Tagger run: completes, emits urgency + category, carries usage. ---
  await db
    .insertInto('triage_operator_runs')
    .values({
      triage_id: triageId,
      operator_id: ops.llm,
      message_id: messageId,
      type_key: 'llm_tagger',
      type_code_version: LLM_CV,
      op_config_json: configs.llm,
      status: 'completed',
      started_at: startedAt + 1,
      finished_at: startedAt + 3,
      duration_ms: 1840,
      skip_reason: null,
      error_summary: null,
      resource_usage_json: JSON.stringify({
        resource: 'llm_bedrock',
        operation: 'invoke_model',
        model_id: 'anthropic.claude-haiku-4-5-20251001-v1:0',
        input_tokens: 612,
        output_tokens: 28,
        attempts: 1,
      }),
      created_at: startedAt,
    })
    .execute()

  // --- Rule-based Tagger run: completes, emits needs_reply. ---
  await db
    .insertInto('triage_operator_runs')
    .values({
      triage_id: triageId,
      operator_id: ops.rule,
      message_id: messageId,
      type_key: 'rule_based_tagger',
      type_code_version: RULE_CV,
      op_config_json: configs.rule,
      status: 'completed',
      started_at: startedAt + 1,
      finished_at: startedAt + 1,
      duration_ms: 3,
      skip_reason: null,
      error_summary: null,
      resource_usage_json: null,
      created_at: startedAt,
    })
    .execute()

  // --- Notify action run. ---
  const notifyFailed = m.failed === true
  const notifyLimited = m.limited === true
  const notifyCompleted = !notifyFailed && !notifyLimited && !m.partial
  await db
    .insertInto('triage_operator_runs')
    .values({
      triage_id: triageId,
      operator_id: ops.notify,
      message_id: messageId,
      type_key: 'notify',
      type_code_version: ACTION_CV,
      op_config_json: configs.notify,
      status:
        notifyFailed ? 'failed'
        : notifyCompleted ? 'completed'
        : 'skipped',
      started_at: startedAt + 4,
      finished_at: startedAt + (notifyFailed ? 5 : 4),
      duration_ms:
        notifyFailed ? 920
        : notifyCompleted ? 410
        : null,
      skip_reason:
        notifyLimited ? 'rate limit: pushover send window exhausted'
        : m.partial ? 'urgency below notify threshold'
        : null,
      error_summary: notifyFailed ? 'pushover_api.send_notification returned 503' : null,
      resource_usage_json:
        notifyCompleted ?
          JSON.stringify({
            resource: 'pushover_api',
            operation: 'send_notification',
            attempts: 1,
          })
        : null,
      created_at: startedAt,
    })
    .execute()

  // --- Apply Category action run. ---
  const applyCompleted = !m.partial && !m.failed
  await db
    .insertInto('triage_operator_runs')
    .values({
      triage_id: triageId,
      operator_id: ops.apply,
      message_id: messageId,
      type_key: 'apply_category',
      type_code_version: ACTION_CV,
      op_config_json: configs.apply,
      status: applyCompleted ? 'completed' : 'skipped',
      started_at: startedAt + 4,
      finished_at: startedAt + 4,
      duration_ms: applyCompleted ? 260 : null,
      skip_reason: applyCompleted ? null : 'upstream action did not complete',
      error_summary: null,
      resource_usage_json:
        applyCompleted ?
          JSON.stringify({
            resource: 'gmail_api',
            operation: 'apply_label',
            attempts: 1,
          })
        : null,
      created_at: startedAt,
    })
    .execute()

  // --- Tags (the Taggers' settled outputs). ---
  await db
    .insertInto('tags')
    .values([
      {
        triage_id: triageId,
        operator_id: ops.llm,
        key: 'urgency',
        value: m.urgency,
        created_at: startedAt + 3,
      },
      {
        triage_id: triageId,
        operator_id: ops.llm,
        key: 'category',
        value: m.category,
        created_at: startedAt + 3,
      },
      {
        triage_id: triageId,
        operator_id: ops.rule,
        key: 'needs_reply',
        value: m.needsReply,
        created_at: startedAt + 1,
      },
    ])
    .execute()

  // --- triage_events: tag_set per Tagger + resource-op outcomes. ---
  let sequenceNum = 0
  const event = async (
    operatorId: number,
    eventType: 'tag_set' | 'resource_op_succeeded' | 'resource_op_limited' | 'resource_op_failed',
    details: Record<string, unknown> | null,
    at: number,
  ): Promise<void> => {
    sequenceNum += 1
    await db
      .insertInto('triage_events')
      .values({
        triage_id: triageId,
        operator_id: operatorId,
        sequence_num: sequenceNum,
        event_type: eventType,
        details_json: details ? JSON.stringify(details) : null,
        recorded_at: at,
      })
      .execute()
  }

  await event(ops.llm, 'tag_set', { key: 'urgency', value: m.urgency }, startedAt + 3)
  await event(ops.llm, 'tag_set', { key: 'category', value: m.category }, startedAt + 3)
  await event(ops.llm, 'resource_op_succeeded', { resource: 'llm_bedrock', operation: 'invoke_model' }, startedAt + 3)
  await event(ops.rule, 'tag_set', { key: 'needs_reply', value: m.needsReply }, startedAt + 1)
  if (notifyFailed) {
    await event(
      ops.notify,
      'resource_op_failed',
      {
        resource: 'pushover_api',
        operation: 'send_notification',
        error: 'pushover_api.send_notification returned 503',
      },
      startedAt + 5,
    )
  } else if (notifyLimited) {
    await event(
      ops.notify,
      'resource_op_limited',
      {
        resource: 'pushover_api',
        operation: 'send_notification',
        scope: 'per_window',
      },
      startedAt + 4,
    )
  } else if (notifyCompleted) {
    await event(
      ops.notify,
      'resource_op_succeeded',
      { resource: 'pushover_api', operation: 'send_notification' },
      startedAt + 4,
    )
  }
  if (applyCompleted) {
    await event(ops.apply, 'resource_op_succeeded', { resource: 'gmail_api', operation: 'apply_label' }, startedAt + 4)
  }

  // --- current_triages cache: latest-started Triage wins per (message, pipeline). ---
  await db
    .insertInto('current_triages')
    .values({
      message_id: messageId,
      pipeline_id: pipelineId,
      triage_id: triageId,
      triage_started_at: startedAt,
      updated_at: endedAt,
    })
    .onConflict((oc) =>
      oc.columns(['message_id', 'pipeline_id']).doUpdateSet((eb) => ({
        triage_id: eb.ref('excluded.triage_id'),
        triage_started_at: eb.ref('excluded.triage_started_at'),
        updated_at: eb.ref('excluded.updated_at'),
      })),
    )
    .execute()
}

/**
 * Seed Limit usage counters so the Settings → Limits "usage" column is
 * non-zero: a live window counter for the Pushover and Bedrock per-window
 * limits, and a couple of per-message counters for the apply_label per-window /
 * send_message per-message limits.
 */
async function seedLimitUsage(db: DB, userId: number, now: number): Promise<void> {
  const limits = await db
    .selectFrom('limits')
    .select(['id', 'resource', 'operation', 'scope'])
    .where('user_id', '=', userId)
    .execute()

  const find = (resource: string, operation: string, scope: string) =>
    limits.find((l) => l.resource === resource && l.operation === operation && l.scope === scope)?.id

  const pushoverWindow = find('pushover_api', 'send_notification', 'per_window')
  const bedrockWindow = find('llm_bedrock', 'invoke_model', 'per_window')
  const gmailLabelWindow = find('gmail_api', 'apply_label', 'per_window')
  const pushoverPerMsg = find('pushover_api', 'send_notification', 'per_message')

  const windowRows: {
    limit_id: number
    window_start: number
    count: number
  }[] = []
  if (pushoverWindow) {
    windowRows.push({
      limit_id: pushoverWindow,
      window_start: now - 120,
      count: 4,
    })
  }
  if (bedrockWindow) {
    windowRows.push({
      limit_id: bedrockWindow,
      window_start: now - 90,
      count: 22,
    })
  }
  if (gmailLabelWindow) {
    windowRows.push({
      limit_id: gmailLabelWindow,
      window_start: now - 200,
      count: 17,
    })
  }
  if (windowRows.length > 0) {
    await db.insertInto('limit_counters_window').values(windowRows).execute()
  }

  if (pushoverPerMsg) {
    await db
      .insertInto('limit_counters_message')
      .values([
        { limit_id: pushoverPerMsg, message_id: 2, count: 1 },
        { limit_id: pushoverPerMsg, message_id: 10, count: 1 },
        { limit_id: pushoverPerMsg, message_id: 19, count: 1 },
      ])
      .execute()
  }
}

// --- main -------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const now = Math.floor(Date.now() / 1000)

  const rawKey = process.env.GRINBOX_TOKEN_ENC_KEY
  let encKey: Buffer | null = null
  if (rawKey) {
    encKey = decodeKey(rawKey)
    if (encKey?.length !== 32) {
      throw new Error('GRINBOX_TOKEN_ENC_KEY must decode (base64 or hex) to exactly 32 bytes')
    }
  } else {
    console.warn('[seed-demo] GRINBOX_TOKEN_ENC_KEY not set — skipping credentials; accounts will read "needs_auth".')
  }

  const db = openDatabase(args.dbPath)
  try {
    await runMigrations(db)

    const existing = await db.selectFrom('users').select('id').limit(1).executeTakeFirst()
    if (existing && !args.reset) {
      throw new Error(
        `DB at ${args.dbPath} already has data. Re-run with --reset to clear and reseed, or point --db / GRINBOX_DB_PATH at a fresh path.`,
      )
    }
    if (existing && args.reset) {
      console.log('[seed-demo] --reset: clearing existing data…')
      await clearAllData(db)
    }

    await seed(db, now, encKey)

    const counts = await db
      .selectFrom('messages')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .executeTakeFirst()
    console.log(
      `[seed-demo] done. db=${args.dbPath} messages=${counts?.n ?? 0} ` +
        `credentials=${encKey ? 'stored (accounts "ok")' : 'skipped (accounts "needs_auth")'}`,
    )
  } finally {
    await db.destroy()
  }
}

main().catch((err: unknown) => {
  console.error('[seed-demo] failed:', err)
  process.exit(1)
})
