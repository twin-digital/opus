import { execa, execaSync } from 'execa'

// Tagged-template shell helper. Reconstructs the command and runs it via a
// shell so callers can write: $`docker build -f ${dockerfile} ${context}`
export const $ = (strings, ...values) => {
  const command = strings.reduce((acc, s, i) => acc + s + (i < values.length ? String(values[i]) : ''), '').trim()

  try {
    // Use shell:true so the full command string is interpreted by the shell.
    const result = execaSync(command, { shell: true, stdio: 'inherit' })
    console.log(`✅ ${result.command}`)
    return result
  } catch (e) {
    console.error(`❌ ${e.command || command}`)
    if (e.all) console.error(e.all)
    process.exit(e.exitCode || 1)
  }
}

// For long-running background processes (watch, servers, etc.)
export const bg$ = (strings, ...values) => {
  const command = strings.reduce((acc, s, i) => acc + s + (i < values.length ? String(values[i]) : ''), '').trim()

  console.log(`🔄 Starting: ${command}`)

  // Use execa (not execaSync) and return the child process
  const child = execa(command, {
    shell: true,
    stdio: 'inherit',
    cleanup: true,
  })

  child.catch((e) => {
    console.error(`❌ ${command}`)
    process.exit(e.exitCode || 1)
  })

  return child
}
