/**
 * The subset of `@julusian/midi`'s Input/Output used to enumerate ports.
 */
export interface PortLister {
  getPortCount(): number
  getPortName(port: number): string
}

/**
 * Lists the currently-available port names for one direction. Duplicate names get a numeric
 * suffix (`name`, `name1`, ...), replicating easymidi's numbered-name scheme so results stay
 * comparable to the names the `easymidi.Input`/`Output` constructors expect.
 */
export const listNumberedPortNames = (client: PortLister): string[] => {
  const count = client.getPortCount()
  const names: string[] = []
  const used = new Set<string>()
  for (let i = 0; i < count; i++) {
    const portName = client.getPortName(i)
    let numberedPortName = portName
    for (let counter = 1; used.has(numberedPortName); counter++) {
      numberedPortName = `${portName}${counter}`
    }
    names.push(numberedPortName)
    used.add(numberedPortName)
  }
  return names
}
