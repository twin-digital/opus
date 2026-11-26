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
