import type { FieldType, Id } from '@thrashplay/wishem-core'
import type { ReactNode } from 'react'

export interface PropDeclaration {
  /** The ID of a field of the component type of the view. */
  field: Id
  type: FieldType
}

export type PropDeclarations = Record<string, PropDeclaration>

/** The value type for each field type. */
interface FieldValueTypes {
  string: string
}

/** A prop has no value when the component omits the field or the definition does not have it. */
export type ViewProps<P extends PropDeclarations> = {
  readonly [Name in keyof P]: FieldValueTypes[P[Name]['type']] | undefined
}

export interface View<P extends PropDeclarations = PropDeclarations> {
  /** The ID of the component type that this view draws. */
  componentType: Id
  props: P
  render: (props: ViewProps<P>) => ReactNode
}

/** Declares a view. Returns its argument and gives the render function typed props. */
export const defineView = <const P extends PropDeclarations>(view: View<P>): View<P> => view
