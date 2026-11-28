import type { ComponentProps, ReactNode } from 'react'

/**
 * The props of the element `T`, with no `className` and no `style`.
 */
export type Native<T extends keyof React.JSX.IntrinsicElements> = Omit<ComponentProps<T>, 'className' | 'style'>

/**
 * The props of a component that shows one text.
 */
export interface TextProps {
  children: ReactNode
}

/**
 * Drops the keys that have the value `undefined`, so that they do not replace a value of the caller.
 */
export const defined = <T extends object>(value: T) =>
  Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>
