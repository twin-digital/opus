export interface Message {
  id: string
  body: string
  timestamp: number
}

export function validateMessage(msg: Message): boolean {
  return !!msg.id && !!msg.body && typeof msg.timestamp === 'number'
}
