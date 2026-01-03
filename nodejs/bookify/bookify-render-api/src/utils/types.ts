import type { Context } from 'aws-lambda'

export type AsyncHandler<TEvent = unknown, TResult = unknown> = (event: TEvent, context: Context) => Promise<TResult>
