/**
 * Primitive values allowed in configuration objects.
 */
export type ConfigPrimitive = string | number | boolean | null | undefined

/**
 * A configuration value consisting of config primitives, or arrays or string-keyed records of the same.
 */
export type ConfigValue = ConfigPrimitive | { [key: string]: ConfigValue } | ConfigValue[]
