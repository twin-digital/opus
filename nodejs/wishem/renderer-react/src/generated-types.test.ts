// The type check of the package reads the `@ts-expect-error` lines. The test body only runs a stub.
import { expect, it } from 'vitest'
import { stubViewTools, type ViewTools } from './view-tools.js'

/** The form of a generated file for a component type with a string, a boolean, and a number field. */
interface Values {
  readonly title: string
  readonly done: boolean
  readonly points: number
}

interface Props extends Readonly<Partial<Values>> {
  readonly wishem: ViewTools<Values>
}

const takesText = (_text: string) => undefined

/** Never called. The type check reads it. */
export const typeChecks = (props: Props) => {
  void props.wishem.setField('title', 'a')
  void props.wishem.setField('done', true)
  void props.wishem.setField('points', 3)

  // @ts-expect-error The field `done` takes a boolean.
  void props.wishem.setField('done', 'yes')

  // @ts-expect-error No field has the name `colour`.
  void props.wishem.setField('colour', 'red')

  // @ts-expect-error A number prop is not text.
  takesText(props.points)

  // @ts-expect-error A view reads only the props that the type has.
  void props.colour
}

it('accepts a stub as the prop wishem of a generated type', async () => {
  const { tools, calls } = stubViewTools<Values>()
  await tools.setField('done', true)
  expect(calls).toEqual([{ kind: 'setField', name: 'done', value: true }])
})
