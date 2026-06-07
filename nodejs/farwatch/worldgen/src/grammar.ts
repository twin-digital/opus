import type { ArcShape } from './types.js'

/**
 * The founding-grammar: a themed palette + coherence by construction. Theme lives in
 * the constraints — every field of a Theme is drawn only from that theme, so a founding
 * hangs together (an aquatic theme pulls aquatic names, domains, tensions, and threads).
 *
 * This is hand-authored content (the axiomatic founding layer). Add a theme by adding
 * an entry; the sampler and renderer need no changes.
 */

export interface PurposeTemplate {
  /** The charter phrase: "to wake the drowned god beneath the reef". */
  text: string
  arcShape: ArcShape
  /** Why the shape is what it is — surfaced in the rendered founding. */
  arcGloss: string
  /** Domains the purpose demands (drawn from the Domain axis). */
  domains: string[]
}

export interface Theme {
  key: string
  /** Compact-name options. */
  names: string[]
  /** Theme adjective tags. */
  tags: string[]
  /** Mood lines. */
  moods: string[]
  /** Charter templates this theme can found a compact upon. */
  purposes: PurposeTemplate[]
  /** Given-name pool fitting the theme. */
  givenNames: string[]
  /** Epithet / role fragments, often domain-flavored. */
  epithets: string[]
  /** Flavor lines — scarce narrative instances bound to a (seeker, tag). */
  flavors: string[]
  /** Tension templates. Tokens {a} {b} {elder} {name} → distinct cast names; {lost} → a lost name. */
  tensions: string[]
  /** Open-thread templates (questions). Same tokens. */
  threads: string[]
}

export const THEMES: Theme[] = [
  {
    key: 'drowned',
    names: ['The Tidebound', 'The Drowned Choir', 'The Reefwardens', 'The Saltkeepers'],
    tags: ['sunken', 'saline', 'ancient', 'patient', 'green-dark'],
    moods: [
      'a green dark, patient and pressing',
      'the slow cold of deep water, and the sound of distant bells',
      'salt in everything, and something below that does not sleep well',
    ],
    purposes: [
      {
        text: 'to wake the drowned god that sleeps beneath the reef',
        arcShape: 'terminal',
        arcGloss: 'a god can, in the end, be woken',
        domains: ['magic', 'exploration', 'diplomacy'],
      },
      {
        text: 'to chart every road and ruin of the black water',
        arcShape: 'terminal',
        arcGloss: 'even an ocean has an edge, given lifetimes',
        domains: ['exploration', 'lore', 'craft'],
      },
      {
        text: 'to keep the tide-rites unbroken so the sea stays kind',
        arcShape: 'perennial',
        arcGloss: 'the sea is never finally appeased',
        domains: ['magic', 'art', 'diplomacy'],
      },
      {
        text: 'to raise the sunken city of Aumere from the deep',
        arcShape: 'terminal',
        arcGloss: 'a city raised is a city finished',
        domains: ['craft', 'magic', 'combat'],
      },
    ],
    givenNames: [
      'Gerald',
      'Greta',
      'Maelis',
      'Aldous',
      'Sered',
      'Orin',
      'Thessaly',
      'Calder',
      'Nerith',
      'Wene',
      'Bryn',
      'Oslin',
    ],
    epithets: ['the diver', 'Tidecaller', 'of the reef', 'Salthand', 'the deep-walker', 'who counts the bells'],
    flavors: [
      'loves the deep water',
      'is fond of the old drowned songs',
      'fears the open surface',
      'reveres the things that wait below',
      'keeps a tally of every wreck',
      'will not eat fish',
      'speaks to the tide as to a parent',
    ],
    tensions: [
      'The waking-rites the charter demands are forbidden by {elder}, who remembers what woke last time.',
      '{a} and {b} disagree, bitterly, on whether the drowned god should be woken at all.',
      'The reef is dying, and {elder} swears the charter itself is the cause.',
    ],
    threads: [
      'Who drowned {lost}, the predecessor’s favourite, the winter before you came?',
      '{name} has begun to dream the dreams of the dead. What is calling them down?',
      'A bell rings under the water that no living hand could reach. Whose is it?',
    ],
  },
  {
    key: 'ashen',
    names: ['The Emberwright', 'The Cinder Hold', 'The Forgesworn', 'The Ashen Choir'],
    tags: ['guttering', 'iron', 'smoke-stained', 'tireless', 'ember-lit'],
    moods: [
      'heat that never quite dies, and never quite warms',
      'the ring of hammers under a red and lidless sky',
      'ash on the tongue, iron in the blood, and a fire that remembers',
    ],
    purposes: [
      {
        text: 'to relight the Great Forge that the old world let die',
        arcShape: 'terminal',
        arcGloss: 'a fire can be lit, once and for all',
        domains: ['craft', 'magic', 'exploration'],
      },
      {
        text: 'to forge the engine that will end the long winter',
        arcShape: 'terminal',
        arcGloss: 'an engine, once built, is built',
        domains: ['craft', 'magic', 'lore'],
      },
      {
        text: 'to keep the ember-saints burning against the dark',
        arcShape: 'perennial',
        arcGloss: 'the dark is never finished coming',
        domains: ['magic', 'combat', 'art'],
      },
      {
        text: 'to break the iron tyrants that hold the lowland roads',
        arcShape: 'perennial',
        arcGloss: 'tyrants are many, and the roads are long',
        domains: ['combat', 'craft', 'diplomacy'],
      },
    ],
    givenNames: [
      'Brannoc',
      'Sela',
      'Garrin',
      'Mott',
      'Ysolde',
      'Korv',
      'Anvyl',
      'Pell',
      'Reda',
      'Thane',
      'Cesc',
      'Una',
    ],
    epithets: ['the smith', 'Emberhand', 'of the bellows', 'Ironwill', 'the cinder-walker', 'who never sleeps'],
    flavors: [
      'loves the moment iron turns gold',
      'is fond of the old machine-songs',
      'fears the cold more than death',
      'reveres the first fire',
      'keeps the predecessor’s hammer',
      'cannot abide waste',
      'speaks to engines as to horses',
    ],
    tensions: [
      'The forge the charter demands will burn the last of the sacred coal — {elder} forbids it.',
      '{a} wants the compact armed; {b} says the charter is craft, not war, and never was.',
      'The engine {elder} has been building has begun to ask questions.',
    ],
    threads: [
      'What did {lost} see in the deep furnace that struck them mute?',
      '{name}’s newest work runs without fuel. Who taught them that?',
      'An ember in the inner sanctum will not go out, though no one feeds it. Why?',
    ],
  },
  {
    key: 'clockwork',
    names: ['The Orrery', 'The Clockbound', 'The Glass Choir', 'The Wardens of Hours'],
    tags: ['brittle', 'precise', 'glassy', 'wound-tight', 'cold-lit'],
    moods: [
      'a stillness wound like a spring',
      'light through glass, and the click of small machines keeping count',
      'everything measured, nothing certain',
    ],
    purposes: [
      {
        text: 'to complete the Great Orrery and read the fate it shows',
        arcShape: 'terminal',
        arcGloss: 'an orrery is finished when the last sphere turns',
        domains: ['craft', 'lore', 'magic'],
      },
      {
        text: 'to wind the world-clock before its spring runs down',
        arcShape: 'perennial',
        arcGloss: 'a clock once wound must be wound again',
        domains: ['craft', 'magic', 'art'],
      },
      {
        text: 'to recover the twelve lost hours stolen from the calendar',
        arcShape: 'terminal',
        arcGloss: 'twelve is a number you can reach',
        domains: ['exploration', 'lore', 'diplomacy'],
      },
      {
        text: 'to keep perfect time against a world that drifts',
        arcShape: 'perennial',
        arcGloss: 'drift is endless; correction is forever',
        domains: ['lore', 'art', 'magic'],
      },
    ],
    givenNames: [
      'Vesper',
      'Tolt',
      'Marenne',
      'Quill',
      'Sabin',
      'Elise',
      'Hark',
      'Pendra',
      'Ott',
      'Lune',
      'Cassen',
      'Wira',
    ],
    epithets: ['the winder', 'Glasshand', 'of the twelfth hour', 'the measurer', 'who keeps the count', 'Truewind'],
    flavors: [
      'loves a thing that runs true',
      'is fond of the old star-charts',
      'fears the moment a spring snaps',
      'reveres the first maker',
      'keeps a watch that cannot be wrong',
      'will not be hurried',
      'hears the world ticking',
    ],
    tensions: [
      'The hour the charter seeks is held by {elder}, who says some hours are lost for good reason.',
      '{a} reads ruin in the Orrery; {b} reads glory. Both may be right.',
      '{elder}’s clock has begun to keep a different time than all the others.',
    ],
    threads: [
      'Why did {lost} smash the master-clock the night before they vanished?',
      '{name}’s timepiece runs backward at midnight. Since when, and at whose touch?',
      'One sphere of the Orrery turns that no one set in motion. Which fate does it read?',
    ],
  },
  {
    key: 'verdant',
    names: ['The Rootbound', 'The Green Choir', 'The Wardens of the Wild', 'The Overgrowth'],
    tags: ['overgrown', 'fecund', 'rotting', 'patient', 'green-shadowed'],
    moods: [
      'growth that does not ask permission',
      'the smell of green rot and new leaves at once',
      'old iron going soft under moss, and something glad about it',
    ],
    purposes: [
      {
        text: 'to wake the sleeping wood that once walked',
        arcShape: 'terminal',
        arcGloss: 'even a forest can be roused, once',
        domains: ['magic', 'diplomacy', 'exploration'],
      },
      {
        text: 'to seed the dead lowlands green again',
        arcShape: 'perennial',
        arcGloss: 'the land is wide; the work outlasts hands',
        domains: ['craft', 'magic', 'lore'],
      },
      {
        text: 'to find the heart-seed before the rot takes it',
        arcShape: 'terminal',
        arcGloss: 'a seed is a thing you can hold',
        domains: ['exploration', 'combat', 'lore'],
      },
      {
        text: 'to hold the green line against the spreading blight',
        arcShape: 'perennial',
        arcGloss: 'blight does not surrender',
        domains: ['combat', 'magic', 'craft'],
      },
    ],
    givenNames: ['Bram', 'Hollis', 'Mira', 'Tane', 'Fersa', 'Loam', 'Wyn', 'Esk', 'Dell', 'Rue', 'Cobb', 'Senna'],
    epithets: [
      'the green-handed',
      'Rootwalker',
      'of the deep wood',
      'the seed-keeper',
      'who listens to trees',
      'Mossheart',
    ],
    flavors: [
      'loves the first green of a dead field',
      'is fond of the old growing-songs',
      'fears the blight more than any beast',
      'reveres the eldest tree',
      'keeps a seed from before the rot',
      'will not cut living wood',
      'speaks with the things that grow',
    ],
    tensions: [
      'The seed the charter demands grows in {elder}’s grove, and {elder} will not give it up.',
      '{a} would burn the blight; {b} says fire is the blight’s truest friend.',
      'Something {elder} planted has grown larger, and hungrier, than was meant.',
    ],
    threads: [
      'What took root in {lost} before the wood took them entirely?',
      '{name}’s garden flowers in a season nothing should. Who waters it by dark?',
      'A green light moves in the deep wood at night, tending things. Whose hand?',
    ],
  },
  {
    key: 'starlit',
    names: ['The Farwatch', 'The Star Choir', 'The Wardens of the Long Dark', 'The Voidbound'],
    tags: ['cold', 'vast', 'star-pricked', 'distant', 'wakeful'],
    moods: [
      'a cold that comes from very far away',
      'the long patience of watchers, and the light very old',
      'more dark than light, and the dark paying attention',
    ],
    purposes: [
      {
        text: 'to read the name written in the dying stars',
        arcShape: 'terminal',
        arcGloss: 'a name, once read, is read',
        domains: ['lore', 'magic', 'exploration'],
      },
      {
        text: 'to keep the long watch against the thing between the stars',
        arcShape: 'perennial',
        arcGloss: 'the watch has no last night',
        domains: ['combat', 'magic', 'art'],
      },
      {
        text: 'to chart a road to the cold light that calls',
        arcShape: 'terminal',
        arcGloss: 'every road, in the end, arrives',
        domains: ['exploration', 'lore', 'craft'],
      },
      {
        text: 'to gather the scattered star-iron before the dark does',
        arcShape: 'terminal',
        arcGloss: 'what is gathered can be finished',
        domains: ['exploration', 'combat', 'craft'],
      },
    ],
    givenNames: ['Castor', 'Veil', 'Anside', 'Mereth', 'Tolan', 'Sib', 'Wend', 'Orrin', 'Lyse', 'Hale', 'Cael', 'Numa'],
    epithets: ['the watcher', 'Starhand', 'of the long dark', 'the namer', 'who counts the cold', 'Farsight'],
    flavors: [
      'loves the oldest light',
      'is fond of the names of dead stars',
      'fears the space between the lights',
      'reveres the first watcher',
      'keeps the predecessor’s glass',
      'will not sleep when the sky is clear',
      'hears something answering from very far',
    ],
    tensions: [
      'The name the charter seeks is one {elder} has read already — and will not say.',
      '{a} would answer the cold light; {b} says answering is how it finds you.',
      '{elder} has begun to keep watch facing inward, not at the sky.',
    ],
    threads: [
      'What did {lost} see through the great glass the night they stopped speaking?',
      '{name} has started answering questions no one asked aloud. Who is asking?',
      'A light that is not a star holds its place in the turning sky. What watches back?',
    ],
  },
]
