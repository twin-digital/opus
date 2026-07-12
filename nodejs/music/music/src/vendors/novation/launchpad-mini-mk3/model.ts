/**
 * Number from 0-127 specifying a Launchpad palette entry.
 * @see - Programmer's Reference, page 11
 */
export type PaletteColor = number

/**
 * Values for an rgb color, consisting of an ordered tuple of red, green, and blue components.
 */
export type RgbColor = [number, number, number]

export interface BaseLightingOptions {
  /**
   * Type of lighting to enable for this pad:
   *
   *   - flashing: alternates between two colors in time with the MIDI clock
   *   - pulsing: transition between a high- and low-intensity version of a color in time with the MIDI clock
   *   - static: display a solid color
   *
   * See the programmer reference for details on the duty cycle for flashing and pulsing modes.
   */
  type: 'flashing' | 'pulsing' | 'static'

  /**
   * The color to use for this pad. If type is 'static', the LED will light with this color. If the type is
   * 'pulsing' it will transition between low- and high- intensity versions of this color. The pulsing color must be
   * specified as a `PaletteColor`, but a static pad can use either a `PaletteColor` or an `RgbColor`.
   */
  color?: PaletteColor | RgbColor | undefined

  /**
   * Two colors to alternate between when the lighting type is "flashing".
   */
  colors?: [PaletteColor, PaletteColor] | undefined
}

export interface FlashingLighting extends BaseLightingOptions {
  type: 'flashing'
  color?: undefined
  colors: [PaletteColor, PaletteColor]
}

export interface PulsingLighting extends BaseLightingOptions {
  type: 'pulsing'
  color: PaletteColor
  colors?: undefined
}

export interface StaticLighting extends BaseLightingOptions {
  type: 'static'
  color: PaletteColor | RgbColor
  colors?: undefined
}

export type LightingOptions = FlashingLighting | PulsingLighting | StaticLighting
