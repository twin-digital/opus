import type {
  EntityComponentTypes as DeclaredEntityComponentTypes,
  EntityDamageCause as DeclaredEntityDamageCause,
} from '@minecraft/server'

/**
 * The declared enums have types but no runtime values — `@minecraft/server` ships no
 * JavaScript — so each mirror is a const object named exactly as the declared enum, with
 * identical keys and values. The `satisfies` checks pin every key and value to the declaration:
 * an added, removed, or changed member fails the build on a version bump instead of drifting.
 */
type MirrorOf<TEnum extends Record<string, string>> = {
  readonly [K in keyof TEnum]: `${TEnum[K]}`
}

/**
 * Runtime mirror of the `EntityComponentTypes` enum, e.g.
 * `EntityComponentTypes.Health === 'minecraft:health'`. Import the value from this library and
 * the type from `@minecraft/server`; keys and values are identical to the declaration.
 *
 * The exported binding is typed as the declared enum object (string enums are nominal, so a
 * plain literal would be rejected where the enum type is expected); the `satisfies` check on
 * the underlying literal still pins every key and value.
 */
const entityComponentTypesValues = {
  AddRider: 'minecraft:addrider',
  Ageable: 'minecraft:ageable',
  Breathable: 'minecraft:breathable',
  CanClimb: 'minecraft:can_climb',
  CanFly: 'minecraft:can_fly',
  CanPowerJump: 'minecraft:can_power_jump',
  Color: 'minecraft:color',
  Color2: 'minecraft:color2',
  CursorInventory: 'minecraft:cursor_inventory',
  EnderInventory: 'minecraft:ender_inventory',
  Equippable: 'minecraft:equippable',
  FireImmune: 'minecraft:fire_immune',
  FloatsInLiquid: 'minecraft:floats_in_liquid',
  FlyingSpeed: 'minecraft:flying_speed',
  FrictionModifier: 'minecraft:friction_modifier',
  Healable: 'minecraft:healable',
  Health: 'minecraft:health',
  Inventory: 'minecraft:inventory',
  IsBaby: 'minecraft:is_baby',
  IsCharged: 'minecraft:is_charged',
  IsChested: 'minecraft:is_chested',
  IsDyeable: 'minecraft:is_dyeable',
  IsHiddenWhenInvisible: 'minecraft:is_hidden_when_invisible',
  IsIgnited: 'minecraft:is_ignited',
  IsIllagerCaptain: 'minecraft:is_illager_captain',
  IsSaddled: 'minecraft:is_saddled',
  IsShaking: 'minecraft:is_shaking',
  IsSheared: 'minecraft:is_sheared',
  IsStackable: 'minecraft:is_stackable',
  IsStunned: 'minecraft:is_stunned',
  IsTamed: 'minecraft:is_tamed',
  Item: 'minecraft:item',
  LavaMovement: 'minecraft:lava_movement',
  Leashable: 'minecraft:leashable',
  MarkVariant: 'minecraft:mark_variant',
  Movement: 'minecraft:movement',
  MovementAmphibious: 'minecraft:movement.amphibious',
  MovementBasic: 'minecraft:movement.basic',
  MovementFly: 'minecraft:movement.fly',
  MovementGeneric: 'minecraft:movement.generic',
  MovementGlide: 'minecraft:movement.glide',
  MovementHover: 'minecraft:movement.hover',
  MovementJump: 'minecraft:movement.jump',
  MovementSkip: 'minecraft:movement.skip',
  MovementSway: 'minecraft:movement.sway',
  NavigationClimb: 'minecraft:navigation.climb',
  NavigationFloat: 'minecraft:navigation.float',
  NavigationFly: 'minecraft:navigation.fly',
  NavigationGeneric: 'minecraft:navigation.generic',
  NavigationHover: 'minecraft:navigation.hover',
  NavigationWalk: 'minecraft:navigation.walk',
  OnFire: 'minecraft:onfire',
  Exhaustion: 'minecraft:player.exhaustion',
  Hunger: 'minecraft:player.hunger',
  Saturation: 'minecraft:player.saturation',
  Projectile: 'minecraft:projectile',
  PushThrough: 'minecraft:push_through',
  Rideable: 'minecraft:rideable',
  Riding: 'minecraft:riding',
  Scale: 'minecraft:scale',
  SkinId: 'minecraft:skin_id',
  Strength: 'minecraft:strength',
  Tameable: 'minecraft:tameable',
  TameMount: 'minecraft:tamemount',
  TypeFamily: 'minecraft:type_family',
  UnderwaterMovement: 'minecraft:underwater_movement',
  Variant: 'minecraft:variant',
  WantsJockey: 'minecraft:wants_jockey',
} as const satisfies MirrorOf<typeof DeclaredEntityComponentTypes>

export const EntityComponentTypes = entityComponentTypesValues as unknown as typeof DeclaredEntityComponentTypes

/**
 * Runtime mirror of the `EntityDamageCause` enum, e.g.
 * `EntityDamageCause.entityAttack === 'entityAttack'`. Import the value from this library and
 * the type from `@minecraft/server`; keys and values are identical to the declaration.
 *
 * Typed as the declared enum object so members pass where the engine expects an
 * `EntityDamageCause` — building a `damageSource` for `emit`, or `applyDamage` options.
 */
const entityDamageCauseValues = {
  anvil: 'anvil',
  blockExplosion: 'blockExplosion',
  campfire: 'campfire',
  charging: 'charging',
  contact: 'contact',
  drowning: 'drowning',
  entityAttack: 'entityAttack',
  entityExplosion: 'entityExplosion',
  fall: 'fall',
  fallingBlock: 'fallingBlock',
  fire: 'fire',
  fireTick: 'fireTick',
  fireworks: 'fireworks',
  flyIntoWall: 'flyIntoWall',
  freezing: 'freezing',
  lava: 'lava',
  lightning: 'lightning',
  maceSmash: 'maceSmash',
  magic: 'magic',
  magma: 'magma',
  none: 'none',
  override: 'override',
  piston: 'piston',
  projectile: 'projectile',
  ramAttack: 'ramAttack',
  selfDestruct: 'selfDestruct',
  sonicBoom: 'sonicBoom',
  soulCampfire: 'soulCampfire',
  stalactite: 'stalactite',
  stalagmite: 'stalagmite',
  starve: 'starve',
  suffocation: 'suffocation',
  temperature: 'temperature',
  thorns: 'thorns',
  void: 'void',
  wither: 'wither',
} as const satisfies MirrorOf<typeof DeclaredEntityDamageCause>

export const EntityDamageCause = entityDamageCauseValues as unknown as typeof DeclaredEntityDamageCause
