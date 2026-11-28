import type { ViewTools } from '@thrashplay/wishem-renderer-react'

interface Props {
  color: string | undefined
  wishem: ViewTools
}

const ClearColor = ({ color }: Props) =>
  color === undefined ? null : (
    <div role='img' aria-label={`Color ${color}`} style={{ width: 320, height: 180, backgroundColor: color }} />
  )

export default ClearColor
