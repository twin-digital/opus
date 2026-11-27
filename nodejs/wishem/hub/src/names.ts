const NAME = '[a-z][a-z0-9]*(?:-[a-z0-9]+)*'
const ID = new RegExp(`^${NAME}$`)
const INPUT_TYPE = new RegExp(`^${NAME}/${NAME}$`)

/** The reserved ID of the hub. */
export const HUB_ID = 'hub'

/** The reserved input type of a rewind. */
export const REWIND_INPUT_TYPE = 'hub/rewind'

/** Checks the form of the ID of a subsystem, such as `time`. */
export const isId = (value: string): boolean => ID.test(value)

/** Checks the form of an input type, such as `store/set-field`. */
export const isInputType = (value: string): boolean => INPUT_TYPE.test(value)

/** Checks that an input type starts with the reserved name `hub`. */
export const isHubInputType = (value: string): boolean => value.startsWith(`${HUB_ID}/`)
