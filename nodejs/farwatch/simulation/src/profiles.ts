/**
 * Pre-seeded descriptive texture for the cast — the kind of stable, per-person fact that would live
 * in the world's **permanent record**: a physical sketch and a temperament. None of it is simulation
 * load-bearing (the resolver never reads it); it exists so a seeker *reads the same* across every
 * chronicle they appear in, rather than being re-imagined each time by the chronicler.
 *
 * It is hand-seeded here as a stand-in. A later **texturizer** process — unbuilt — will generate
 * these (perhaps deriving them from load-bearing tags), and once the world has a persistent record
 * they will live there, not in source. The table is keyed by name and *is* the cast vocabulary:
 * every name a roster can draw (see `seekers.ts`) is a key here, so every seeker is fully textured.
 */
export interface SeekerProfile {
  /** A physical sketch — build, features, marks, bearing — for the chronicler to render consistently. */
  readonly appearance: string
  /** Manner and disposition — how they carry themselves and meet others. */
  readonly temperament: string
}

export const PROFILES = {
  Wren: {
    appearance: 'small and wiry, with cropped dark hair and quick, restless hands',
    temperament: 'watchful and economical with words, dry-humored once she trusts you',
  },
  Edra: {
    appearance: 'tall and spare, silver-streaked hair bound back, ink-stained fingers',
    temperament: 'exacting and bookish, impatient with bluster',
  },
  Tomas: {
    appearance: 'broad and weathered, a greying beard and a slow, deliberate blink',
    temperament: 'even-tempered and dependable, slow to decide and slow to abandon a thing',
  },
  Sela: {
    appearance: 'slight and sharp-cheeked, a faded scar through one eyebrow',
    temperament: 'guarded and proud, quick to bristle at a slight',
  },
  Garrick: {
    appearance: "lean and rangy, a fox's narrow face and a too-easy smile",
    temperament: 'glib and self-amused, allergic to plain dealing',
  },
  Miren: {
    appearance: 'round-faced and sturdy, sun-browned, hair in a practical braid',
    temperament: 'warm and unflappable, the one who keeps everyone fed',
  },
  Cael: {
    appearance: 'young and lanky, freckled, perpetually windblown',
    temperament: 'eager and guileless, more courage than sense',
  },
  Bryn: {
    appearance: 'compact and muscular, close-shorn, knuckles scarred',
    temperament: 'blunt and stubborn — says little, means all of it',
  },
  Hale: {
    appearance: 'big and ruddy and balding, a booming presence',
    temperament: 'gregarious and loud, generous to a fault',
  },
  Odric: {
    appearance: 'gaunt and stooped, deep-set eyes, a limp from an old break',
    temperament: 'dour and superstitious, expects the worst and is rarely surprised',
  },
  Lys: {
    appearance: 'willowy and pale, ash-blond, a habit of half-smiling',
    temperament: 'soft-spoken and elusive, harder to read than she lets on',
  },
  Pell: {
    appearance: 'short and barrel-chested, bushy-browed, hands like spades',
    temperament: 'grumbling and practical, a soft heart under the complaints',
  },
  Senna: {
    appearance: 'tall and dark, close-cropped curls, a steady gaze',
    temperament: 'composed and decisive, the calm in a bad hour',
  },
  Roon: {
    appearance: 'thickset and shaggy, a flat nose broken more than once',
    temperament: 'slow to speak, slower to anger, frightening when roused',
  },
  Vesna: {
    appearance: 'lean and olive-skinned, hair shorn close, a long scar down one forearm',
    temperament: 'restless and sardonic, allergic to sitting still',
  },
  Dain: {
    appearance: "lithe and quick, a dancer's balance, a perpetual half-grin",
    temperament: "eager and showy, never met a risk he didn't like",
  },
  Asha: {
    appearance: 'small and round, greying hair under a kerchief, sharp little eyes',
    temperament: 'shrewd and motherly, misses nothing',
  },
  Goss: {
    appearance: 'long-limbed and loose, hollow-cheeked, a loping walk',
    temperament: 'laconic and aloof, comes alive only when moving fast',
  },
  Tamsin: {
    appearance: 'freckled and copper-haired, gap-toothed, ink under the nails',
    temperament: 'curious and chatty, asks one too many questions',
  },
  Eli: {
    appearance: 'slim and unremarkable, soft-footed, easy to overlook',
    temperament: 'quiet and observant, content to go unnoticed',
  },
  Maro: {
    appearance: "stocky and scarred, a shaved head and a soldier's bearing",
    temperament: 'disciplined and terse, uneasy without orders',
  },
  Nessa: {
    appearance: 'tall and angular, prematurely grey, long deft fingers',
    temperament: 'cool and precise, warms slowly',
  },
  Joss: {
    appearance: "wiry and sun-creased, a sailor's squint, two fingers missing",
    temperament: 'easy and fatalistic, laughs at bad luck',
  },
  Ferro: {
    appearance: "heavyset and dark-browed, a smith's forearms, a permanent frown",
    temperament: 'taciturn and methodical, trusts work over words',
  },
  Linn: {
    appearance: 'small and birdlike, bright-eyed, quick darting movements',
    temperament: 'nervous and kind, braver than she believes',
  },
} as const satisfies Record<string, SeekerProfile>
