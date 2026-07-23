/**
 * Event signal fakes. A signal implements `subscribe` and `unsubscribe` as declared; delivery
 * has two sources — behaving methods dispatch the after-events their real counterparts cause,
 * and the control-plane `emit` delivers a caller-built payload for cascades the faked surface
 * cannot produce itself.
 */
import type {
  EntityDieAfterEvent,
  EntityDieAfterEventSignal,
  EntityHealthChangedAfterEvent,
  EntityHealthChangedAfterEventSignal,
  EntityHurtAfterEvent,
  EntityHurtAfterEventSignal,
  WorldAfterEvents,
} from '@minecraft/server'

import { notYetImplemented } from './internal/not-yet.js'
import type { Equals, Expect } from './internal/type-checks.js'

/**
 * Shared behaviour of the three shipped signal fakes. Subscribing with filtering options is
 * outside the built surface and throws `NotImplementedError`; delivery is synchronous, to a
 * snapshot of the subscribers registered when dispatch starts.
 */
abstract class FakeEventSignal<TEvent> {
  /**
   * Adds a callback that will be called when the event fires. Returns the passed closure, for
   * use in future calls to `unsubscribe`. Filtering `options` are not modeled: any options
   * argument — even `{}` — throws `NotImplementedError`, while an explicit `undefined` counts
   * as absent. (Each real signal declares its own options type; the fake accepts the argument
   * untyped because a test only ever sees the real signal's signature.)
   */
  subscribe(callback: (event: TEvent) => void, options?: unknown): (event: TEvent) => void {
    void callback
    void options
    return notYetImplemented()
  }

  /** Removes a callback from being called when the event fires. */
  unsubscribe(callback: (event: TEvent) => void): void {
    void callback
    notYetImplemented()
  }
}

/** Fake of `EntityHurtAfterEventSignal`. */
export class FakeEntityHurtAfterEventSignal extends FakeEventSignal<EntityHurtAfterEvent> {}

/** Fake of `EntityHealthChangedAfterEventSignal`. */
export class FakeEntityHealthChangedAfterEventSignal extends FakeEventSignal<EntityHealthChangedAfterEvent> {}

/** Fake of `EntityDieAfterEventSignal`. */
export class FakeEntityDieAfterEventSignal extends FakeEventSignal<EntityDieAfterEvent> {}

/**
 * Delivers an event to a fake signal's subscribers. Module-internal: behaving methods and the
 * control-plane `emit` call this; it is not part of the published surface, and the signal
 * fakes themselves carry only the real members.
 */
export const dispatchEvent = <TEvent>(signal: FakeEventSignal<TEvent>, event: TEvent): void => {
  void signal
  void event
  notYetImplemented()
}

/** The signal properties of `WorldAfterEvents` the first surface builds. */
export const BUILT_AFTER_EVENTS = ['entityDie', 'entityHealthChanged', 'entityHurt'] as const

type BuiltAfterEventKey = (typeof BUILT_AFTER_EVENTS)[number]
type AfterEventsStubKey = Exclude<keyof WorldAfterEvents, BuiltAfterEventKey>

/**
 * Every `WorldAfterEvents` signal outside the first surface; accessing one throws
 * `NotImplementedError`. The `Expect<Equals<...>>` check fails the build if this list drifts
 * from the declaration on a version bump.
 */
export const AFTER_EVENTS_STUBS = [
  'blockContainerClosed',
  'blockContainerOpened',
  'blockExplode',
  'buttonPush',
  'dataDrivenEntityTrigger',
  'effectAdd',
  'entityContainerClosed',
  'entityContainerOpened',
  'entityHeal',
  'entityHitBlock',
  'entityHitEntity',
  'entityItemDrop',
  'entityItemPickup',
  'entityLoad',
  'entityRemove',
  'entitySpawn',
  'entityUpgrade',
  'explosion',
  'gameRuleChange',
  'itemCompleteUse',
  'itemReleaseUse',
  'itemStartUse',
  'itemStartUseOn',
  'itemStopUse',
  'itemStopUseOn',
  'itemUse',
  'leverAction',
  'pistonActivate',
  'playerBreakBlock',
  'playerButtonInput',
  'playerDimensionChange',
  'playerEmote',
  'playerGameModeChange',
  'playerHotbarSelectedSlotChange',
  'playerInputModeChange',
  'playerInputPermissionCategoryChange',
  'playerInteractWithBlock',
  'playerInteractWithEntity',
  'playerInventoryItemChange',
  'playerJoin',
  'playerLeave',
  'playerPlaceBlock',
  'playerSpawn',
  'playerSwingStart',
  'pressurePlatePop',
  'pressurePlatePush',
  'projectileHitBlock',
  'projectileHitEntity',
  'targetBlockHit',
  'tripWireTrip',
  'weatherChange',
  'worldLoad',
] as const

type _afterEventsStubsExact = Expect<Equals<(typeof AFTER_EVENTS_STUBS)[number], AfterEventsStubKey>>

/**
 * Fake of `WorldAfterEvents`: the three damage-path signals are live, every other signal
 * property throws `NotImplementedError` on access.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- stub members are installed on the prototype from AFTER_EVENTS_STUBS, whose completeness the Expect<Equals<...>> check above enforces
export class FakeWorldAfterEvents {
  readonly entityDie: FakeEntityDieAfterEventSignal = notYetImplemented()
  readonly entityHealthChanged: FakeEntityHealthChangedAfterEventSignal = notYetImplemented()
  readonly entityHurt: FakeEntityHurtAfterEventSignal = notYetImplemented()
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type -- see class comment; the interface half of the merge intentionally adds only inherited members
export interface FakeWorldAfterEvents extends Pick<WorldAfterEvents, AfterEventsStubKey> {}

type _fakeAfterEventsAssignable = Expect<FakeWorldAfterEvents extends WorldAfterEvents ? true : false>
type _fakeAfterEventsNoExtraMembers = Expect<Equals<keyof FakeWorldAfterEvents, keyof WorldAfterEvents>>

type _hurtSignalAssignable = Expect<FakeEntityHurtAfterEventSignal extends EntityHurtAfterEventSignal ? true : false>
type _healthChangedSignalAssignable = Expect<
  FakeEntityHealthChangedAfterEventSignal extends EntityHealthChangedAfterEventSignal ? true : false
>
type _dieSignalAssignable = Expect<FakeEntityDieAfterEventSignal extends EntityDieAfterEventSignal ? true : false>
