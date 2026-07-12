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
  const names: string[] = []
  for (let i = 0; i < client.getPortCount(); i++) {
    const portName = client.getPortName(i)
    let numberedPortName = portName
    for (let counter = 1; names.includes(numberedPortName); counter++) {
      numberedPortName = `${portName}${counter}`
    }
    names.push(numberedPortName)
  }
  return names
}
