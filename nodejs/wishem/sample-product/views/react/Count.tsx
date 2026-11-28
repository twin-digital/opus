import type { ViewTools } from '@thrashplay/wishem-renderer-react'

interface Props {
  count: number | undefined
  wishem: ViewTools
}

const Count = ({ count }: Props) => (count === undefined ? null : <p>Count {count}</p>)

export default Count
