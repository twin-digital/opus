// Drives the workbench page in the pinned browser and prints the state of the product panel.
// Usage, from the root of the repository:
//   node nodejs/wishem/workbench-app/scripts/browser-server.ts \
//     node ../docs/milestones/a4-workbench/page-driver.mjs [--url <page>] [--width <px>] [--scheme light|dark] <step>...
// Default --url http://127.0.0.1:5173/, --width 1280, --scheme light.
// Steps, in order:
//   select:<short ID>                       click the item of the entity in the list
//   type:<Component>.<field>=<text>         fill the text field and press Enter, then wait for the row to leave "saving"
//   typeonly:<Component>.<field>=<text>     fill the text field, no commit
//   escape:<Component>.<field>              press Escape in the text field
//   check:<Component>.<field>               click the check box
//   choose:<Component>.<field>=<short ID>   select the option of the entity
//   exec:<command>                          run the command in a shell, in the root of the repository
//   wait:<ms>
//   print                                   print the state now
//   shot:<file>                             save a screenshot of the page; the path is from the root of the repository
// After the last step, the script prints the state of the panel.
// Exit code 0, or 1 with the line `error: <message>` when a step fails.
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const STEP_TIMEOUT = 5000
// The working folder is `nodejs/wishem/workbench-app`.
const root = resolve(process.cwd(), '..', '..', '..')

/** Splits `<Component>.<field>` (the component label has no dot). */
const parseRow = (text) => {
  const dot = text.indexOf('.')
  if (dot < 1 || dot === text.length - 1) {
    throw new Error(`"${text}" is not <Component>.<field>`)
  }
  return { group: text.slice(0, dot), field: text.slice(dot + 1) }
}

/** Splits `<left>=<right>` at the first `=`. */
const parseAssignment = (text) => {
  const at = text.indexOf('=')
  if (at < 0) {
    throw new Error(`"${text}" has no "="`)
  }
  return { left: text.slice(0, at), right: text.slice(at + 1) }
}

const parseArguments = (argv) => {
  const options = { url: 'http://127.0.0.1:5173/', width: 1280, scheme: 'light' }
  const steps = []
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]
    if (argument === '--url' || argument === '--width' || argument === '--scheme') {
      const value = argv[++index]
      if (value === undefined) {
        throw new Error(`${argument} needs a value`)
      }
      if (argument === '--width') {
        options.width = Number(value)
        if (!Number.isInteger(options.width) || options.width <= 0) {
          throw new Error(`--width "${value}" is not a positive integer`)
        }
      } else if (argument === '--scheme') {
        if (value !== 'light' && value !== 'dark') {
          throw new Error(`--scheme "${value}" is not light or dark`)
        }
        options.scheme = value
      } else {
        options.url = value
      }
    } else {
      steps.push(argument)
    }
  }
  return { options, steps }
}

/** Reads the state of the panel in the page. */
const readState = (page) =>
  page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Entities"]')
    if (!nav) {
      return { panel: false }
    }
    const entities = [...nav.querySelectorAll('li button')].map((button) => {
      const [name, shortId] = [...button.querySelectorAll('span')].map((span) => span.textContent ?? '')
      return { name, shortId, selected: button.getAttribute('aria-current') === 'true' }
    })
    const rows = []
    for (const fieldset of document.querySelectorAll('fieldset')) {
      const group = fieldset.querySelector('legend')?.textContent ?? ''
      for (const label of fieldset.querySelectorAll('label')) {
        const control = document.getElementById(label.htmlFor)
        if (!control) {
          continue
        }
        let value
        if (control instanceof HTMLInputElement && control.type === 'checkbox') {
          value = String(control.checked)
        } else if (control instanceof HTMLSelectElement) {
          value = control.selectedOptions[0]?.text ?? ''
        } else {
          value = control.value
        }
        rows.push({
          group,
          field: label.textContent ?? '',
          value,
          saving: control.getAttribute('aria-busy') === 'true',
        })
      }
    }
    const alerts = [...document.querySelectorAll('[role="alert"]')].map((element) => element.textContent ?? '')
    const zero = [...document.querySelectorAll('p')].find((element) => element.textContent === 'Inspector')
    const inspector = zero?.nextElementSibling?.textContent ?? undefined
    return { panel: true, entities, rows, alerts, inspector }
  })

const formatState = (state) => {
  if (!state.panel) {
    return 'panel: none'
  }
  const lines = [
    `entities: ${state.entities.map((entity) => `${entity.name} ${entity.shortId}${entity.selected ? ' [selected]' : ''}`).join('; ')}`,
    ...state.rows.map((row) => `${row.group}.${row.field} = ${row.value}${row.saving ? ' [saving]' : ''}`),
    ...state.alerts.map((alert) => `alert: ${alert}`),
  ]
  if (state.inspector !== undefined) {
    lines.push(`inspector: ${state.inspector}`)
  }
  return lines.join('\n')
}

/** The control of a row: the control with the name of the field in the group with the name of the component type. */
const rowControl = (page, group, field, role) =>
  page.getByRole('group', { name: group, exact: true }).getByRole(role, { name: field, exact: true })

const waitForSaved = (page) =>
  page.waitForFunction(() => document.querySelector('[aria-busy="true"]') === null, undefined, {
    timeout: STEP_TIMEOUT,
  })

const runStep = async (page, step) => {
  const colon = step.indexOf(':')
  const name = colon < 0 ? step : step.slice(0, colon)
  const argument = colon < 0 ? '' : step.slice(colon + 1)
  switch (name) {
    case 'select': {
      const item = page
        .getByRole('navigation', { name: 'Entities', exact: true })
        .getByRole('button')
        .filter({ hasText: argument })
      await item.click({ timeout: STEP_TIMEOUT })
      return
    }
    case 'type':
    case 'typeonly': {
      const { left, right } = parseAssignment(argument)
      const { group, field } = parseRow(left)
      const control = rowControl(page, group, field, 'textbox')
      await control.fill(right, { timeout: STEP_TIMEOUT })
      if (name === 'type') {
        await control.press('Enter', { timeout: STEP_TIMEOUT })
        await waitForSaved(page)
      }
      return
    }
    case 'escape': {
      const { group, field } = parseRow(argument)
      await rowControl(page, group, field, 'textbox').press('Escape', { timeout: STEP_TIMEOUT })
      return
    }
    case 'check': {
      const { group, field } = parseRow(argument)
      await rowControl(page, group, field, 'checkbox').click({ timeout: STEP_TIMEOUT })
      await waitForSaved(page)
      return
    }
    case 'choose': {
      const { left, right } = parseAssignment(argument)
      const { group, field } = parseRow(left)
      const control = rowControl(page, group, field, 'combobox')
      const option = control.locator('option', { hasText: right })
      const value = await option.first().getAttribute('value', { timeout: STEP_TIMEOUT })
      if (value === null) {
        throw new Error(`no option with "${right}"`)
      }
      await control.selectOption(value, { timeout: STEP_TIMEOUT })
      await waitForSaved(page)
      return
    }
    case 'exec': {
      const run = spawnSync('sh', ['-c', argument], { cwd: root, encoding: 'utf8' })
      if (run.status !== 0) {
        throw new Error(`the command ended with code ${String(run.status)}: ${run.stderr.trim()}`)
      }
      return
    }
    case 'wait': {
      const ms = Number(argument)
      if (!Number.isFinite(ms) || ms < 0) {
        throw new Error(`"${argument}" is not a number of milliseconds`)
      }
      await page.waitForTimeout(ms)
      return
    }
    case 'print':
      console.log(formatState(await readState(page)))
      return
    case 'shot':
      await page.screenshot({ path: resolve(root, argument), fullPage: true })
      return
    default:
      throw new Error(`unknown step "${step}"`)
  }
}

const main = async () => {
  const { options, steps } = parseArguments(process.argv.slice(2))
  const endpoint = process.env.WISHEM_BROWSER_WS_ENDPOINT
  if (!endpoint) {
    throw new Error('WISHEM_BROWSER_WS_ENDPOINT is not set. Start the script with browser-server.ts.')
  }
  const { chromium } = createRequire(`${process.cwd()}/`)('@playwright/test')
  const browser = await chromium.connect(endpoint, { exposeNetwork: '<loopback>' })
  try {
    const context = await browser.newContext({
      viewport: { width: options.width, height: 720 },
      colorScheme: options.scheme,
    })
    const page = await context.newPage()
    await page.goto(options.url)
    // A page with no product has no panel: wait briefly, then print "panel: none".
    await page
      .getByRole('navigation', { name: 'Entities', exact: true })
      .waitFor({ timeout: STEP_TIMEOUT })
      .catch(() => undefined)
    for (const [index, step] of steps.entries()) {
      try {
        await runStep(page, step)
      } catch (error) {
        const timedOut = error instanceof Error && error.name === 'TimeoutError'
        const message =
          timedOut ? `the page has no matching element after ${String(STEP_TIMEOUT)} ms`
          : error instanceof Error ? error.message.split('\n')[0]
          : String(error)
        throw new Error(`step ${String(index + 1)} ${step}: ${message}`, { cause: error })
      }
      console.log(`step ${String(index + 1)} ${step}: done`)
    }
    console.log(formatState(await readState(page)))
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.log(`error: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
