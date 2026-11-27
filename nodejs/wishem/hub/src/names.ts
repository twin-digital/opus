const NAME = '[a-z][a-z0-9]*(?:-[a-z0-9]+)*'
const ID = new RegExp(`^${NAME}$`)
const INPUT_TYPE = new RegExp(`^${NAME}/${NAME}$`)

/** Checks the form of the ID of a subsystem, such as `time`. */
export const isId = (value: string): boolean => ID.test(value)

/** Checks the form of an input type, such as `store/set-field`. */
export const isInputType = (value: string): boolean => INPUT_TYPE.test(value)
