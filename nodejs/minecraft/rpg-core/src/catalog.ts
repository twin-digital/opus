/**
 * The definitions check every public call makes before acting on an actor. It covers the
 * definitions only: a lookup that succeeds says nothing about whether the actor will render.
 */

import { EntityTypes } from '@minecraft/server'

import { ActorDefinitionsMissingError } from './errors.js'
import { PACK_NAME } from './registry.js'

/** The check, as an injectable dependency of the internal machinery. */
export type EnsureDefinitions = (preset: string, typeId: string) => void

/**
 * Throws `ActorDefinitionsMissingError` when `typeId` is not registered in the world. An engine
 * refusal of the lookup itself — before the world has finished loading — propagates untranslated:
 * the call fails on that refusal rather than on this product's error.
 */
export const requireDefinitions: EnsureDefinitions = (preset, typeId) => {
  if (EntityTypes.get(typeId) === undefined) {
    throw new ActorDefinitionsMissingError(preset, typeId, PACK_NAME)
  }
}
