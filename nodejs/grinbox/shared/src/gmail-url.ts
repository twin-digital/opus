/**
 * Builds a Gmail web deep-link that opens a specific message. Shared by the
 * server (the Notify Operator's Pushover `url`) and the web SPA (the Message
 * detail "Open in Gmail" link) so both tiers construct the URL identically.
 *
 * The id passed here is the Gmail API message id — exactly what Grinbox stores
 * as `messages.backend_message_id`. That id resolves in the web UI under the
 * `#all/<id>` fragment, which opens the message in its Thread regardless of
 * which label currently holds it.
 *
 * `accountIndex` is Gmail's multi-login slot (`/u/<n>/`); `0` is the first
 * signed-in account, which is the right default for a single-account setup.
 */
export function gmailMessageUrl(backendMessageId: string, accountIndex = 0): string {
  return `https://mail.google.com/mail/u/${accountIndex}/#all/${encodeURIComponent(backendMessageId)}`
}
