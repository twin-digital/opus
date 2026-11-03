/**
 * Naming a `@minecraft/server` enum member without the engine.
 *
 * The package ships no runtime JavaScript, so an enum like `GameMode` has a type and no value: code
 * that runs outside the engine names a member by its value. A string enum admits only its own
 * values, so a misspelled member fails to compile; a numeric enum admits any number.
 */
export const enumMember = <E extends string | number>(value: E extends string ? `${E}` : number): E =>
  value as unknown as E
