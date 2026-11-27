// Generated from AppBar.view.json and the definition of its component type. Do not edit.
// To write this file again: pnpm --filter @thrashplay/wishem-workbench-app generate

import type { ViewTools } from '@thrashplay/wishem-renderer-react'

/** The values that `wishem.setField` takes for the component type "AppBar" (ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34). */
export interface Values {
  /** The field "title" (fld_b81d04e7-2c6f-4a39-8d15-0e9a7f3c5b62). */
  readonly title: string
}

/** The fields of the component type "AppBar" (ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34). */
export interface Props {
  /** The field "title" (fld_b81d04e7-2c6f-4a39-8d15-0e9a7f3c5b62). */
  readonly title: string | undefined
  /** Sends inputs for this component. */
  readonly wishem: ViewTools<Values>
}
