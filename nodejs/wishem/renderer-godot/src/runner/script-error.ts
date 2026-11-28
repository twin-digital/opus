/** Tells whether a line of the output of Godot reports a runtime script error. */
export const hasScriptError = (line: string): boolean => line.includes('SCRIPT ERROR')
