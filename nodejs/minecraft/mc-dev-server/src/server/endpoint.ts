/**
 * Where an author points their client. The published port is the run's; the host is whatever the
 * environment already selected as the Docker connection, since that is where the container's
 * published port is bound — a remote daemon publishes on the remote host, not on this one.
 */

/** The host a Docker connection string points at, or `undefined` for a local socket. */
export const endpointHostOf = (dockerHost: string | undefined): string | undefined => {
  if (dockerHost === undefined || dockerHost.trim() === '') {
    return undefined
  }
  try {
    const url = new URL(dockerHost)
    if (url.protocol === 'unix:' || url.protocol === 'npipe:') {
      return undefined
    }
    return url.hostname === '' ? undefined : url.hostname
  } catch {
    return undefined
  }
}

/** The line the harness reports once the server is ready. */
export const connectionLine = (port: number, dockerHost: string | undefined): string => {
  const host = endpointHostOf(dockerHost)
  return host === undefined ?
      `connect on localhost:${String(port)} (the daemon the active Docker context selects)`
    : `connect on ${host}:${String(port)} (from DOCKER_HOST ${dockerHost ?? ''})`
}
