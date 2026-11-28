// Binds the generator of the React renderer to the command of the workbench.
import {
  generateViewTypes as generate,
  type ViewTypesFile,
  type ViewTypesOptions,
  type ViewTypesResult,
} from '@thrashplay/wishem-renderer-react/view-types'

export const VIEW_TYPES_COMMAND = 'pnpm --filter @thrashplay/wishem-workbench-app generate'

/** Writes the types of the props of each view, with the command of the workbench in the header. */
export const generateViewTypes = (options: Omit<ViewTypesOptions, 'command'>): Promise<ViewTypesResult> =>
  generate({ ...options, command: VIEW_TYPES_COMMAND })

export type { ViewTypesFile, ViewTypesResult }
