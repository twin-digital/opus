# Encounter Resolution

## Main Flow

- Observe and Assess
- Select a course of action
- Resolve course of action

## Observe and Assess

Based on the characteristics of the party, determine what they know about the encounter: the decision to be made, possible courses of action, and possible repercussions. In some cases, the party may not even know there is a decision (for example, encountering a trap they did not detect).

### Passive vs Active

In general, it is assumed that the party applies their best effort to any observation. However, it might be possible that certain encounters preclude this, and then "stop and assess" might itself become a course of action.

### Karma vs Fortune

- is observation a binary, 'they have the skill or they don't'?
- or is there a roll/random element?

## Select a Course of Action

Possible courses of action can be modelled as `Options`:

```typescript
Option {
  // HARD gate: is it even available?
  precondition: (state) => bool

  // paid regardless of outcome
  upfrontCost:  { time, resources }

  // the Resolve roll this induces (null = auto-resolves)
  // { skill, difficulty, position/downside-cap, toll-profile }
  check:        CheckParams | null

  effect:       how progress / relationship-to-objective changes
}
```

### Truth vs. Belief Split

These _Options_ are the real, true situation. However, characters may believe the situation to be different than it really is (due to poor perception skills, mind-altering magic, fatigue, etc.) Based on this, a character decides between a set of `PerceivedOption` objects. These are the same tuple, with values passed through a perception filter that is a function of the character.

> TBD: Does the 'party' perceive and decide as a unit, or do individual party members? Do they all weigh in on perceived danger, for example, with some sort of consensus (or authority) deciding for the group? Can some turn back due to the danger while the rest press on?

### Authoring Vocabulary

When authoring an obstacle, this vocabulary generates the option set — though note they all compile down to the one tuple, so they're a prompt for the content author, not distinct code paths:

1. Overcome — attempt the obstacle directly (cross).
2. Bypass — alternate path, different skill/cost (climb, long way, fly).
3. Modify — change the situation before acting (stabilize, scout).
4. Disengage — change relationship to the objective (turn back, reroute the quest).
5. Spend — trade stored value for a better distribution (fly charge, and your sacrifice mechanic is just a post-roll Spend).

### todo -- insert ravine crossing example
