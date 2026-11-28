// Usage: import { withMergeLock } from './merge-lock.mjs'
// Runs an async function while this process holds an exclusive `flock` on the merge lock file.
// The lock frees when the function ends, or when the process ends.
import { spawn } from 'node:child_process'

export const MERGE_LOCK = '/tmp/wishem-merge.lock'

export const withMergeLock = async (run, lockFile = MERGE_LOCK) => {
  const holder = spawn('flock', ['-x', lockFile, 'sh', '-c', 'echo locked; read _'], {
    stdio: ['pipe', 'pipe', 'inherit'],
  })
  await new Promise((resolve, reject) => {
    holder.once('error', reject)
    holder.once('exit', () => reject(new Error('flock ended before it took the lock')))
    holder.stdout.once('data', resolve)
  })
  try {
    return await run()
  } finally {
    holder.removeAllListeners('exit')
    holder.stdin.end()
  }
}
