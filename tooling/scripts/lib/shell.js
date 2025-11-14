import { execaSync } from 'execa'

export const $ = (strings, ...values) => {
  try {
    const result = execaSync({ all: true })(strings, values)
    if (result.all) {
      console.log(result.all)
    }

    console.log(`✅ ${result.command}`)
    return result
  } catch (e) {
    if (e.all) {
      console.log(e.all)
    }
    console.error(`❌ ${e.command}`)
    process.exit(e.exitCode)
  }
}
