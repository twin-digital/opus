---
'@grinbox/server': minor
'@grinbox/web': minor
'@grinbox/shared': minor
---

A generic IMAP backend, so a mailbox reachable only by IMAP is one grinbox can triage (grinbox 013).

- An IMAP account is added from grinbox's own interface — host, port, whether the connection is
  encrypted from the start or upgraded, a username, and a password stored as a user-obtained
  credential — and exists once the user has accepted the four folders grinbox proposes from the
  server's advertised roles: arrival, archived, trashed, and spam. A server refusing the
  credential pauses the account and asks for the whole connection again, and one whose certificate
  will not verify is refused with nothing to waive.
- Grinbox connects to poll and closes after, one connection at a time per account. It reads what
  the account supports from the server's capabilities and its arrival folder's permanent flags on
  every poll, so an account's gaps are visible before an operator meets them: a save and an
  activation each warn, naming the accounts, and neither is refused.
- Two actions ship. **File** moves a message into a folder the user named literally, and
  **set aside** carries a category and a folder, categorizing where the account can and filing
  where it cannot. A category is a keyword on the message, named in what a keyword admits.
- What grinbox does to the mailbox stays narrow: never marking a message read, moving only by the
  server's own move or a copy and a UID-scoped expunge, archiving only out of the arrival folder,
  and creating no folder anywhere.
- The reconcile's whole-mailbox snapshot now reports a standing per message rather than a list of
  what is present, which the Gmail backend answers too.
