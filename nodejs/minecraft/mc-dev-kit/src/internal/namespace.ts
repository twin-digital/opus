/**
 * Resolves the `namespace` build setting against the owning package's name. A string names the
 * namespace, `true` derives it from the package name — the `@` dropped and the `/` a hyphen — and
 * `false` or absence turns namespacing off, resolving to `undefined`.
 *
 * A resolved namespace holding anything but lowercase letters, digits, underscore, hyphen or dot
 * fails the build naming the character, whichever path named it.
 */
export function resolveNamespace(setting: boolean | string | undefined, packageName: string): string | undefined {
  if (setting === undefined || setting === false) {
    return undefined
  }

  const namespace = setting === true ? packageName.replace(/^@/, '').replace('/', '-') : setting
  if (namespace === '') {
    throw new Error('the namespace is empty: name at least one character')
  }

  const offending = /[^a-z0-9_.-]/u.exec(namespace)
  if (offending !== null) {
    throw new Error(
      `the namespace ${JSON.stringify(namespace)} holds ${JSON.stringify(offending[0])}: only lowercase letters, digits, underscore, hyphen and dot are allowed`,
    )
  }

  return namespace
}
