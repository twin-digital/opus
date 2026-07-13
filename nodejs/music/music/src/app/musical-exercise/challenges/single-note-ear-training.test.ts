import { describe, expect, it } from 'vitest'

import { SingleNoteEarTraining } from './single-note-ear-training.js'

const response = (note: number) => ({ note, duration: 100 })

describe('SingleNoteEarTraining', () => {
  describe('createRandom', () => {
    it('draws only natural notes from the octave starting at middle C', () => {
      const allowed = new Set([60, 62, 64, 65, 67, 69, 71])
      for (let i = 0; i < 200; i++) {
        const challenge = SingleNoteEarTraining.createRandom()
        const [noteon] = challenge.getChallengeSequence(4)
        expect(allowed.has((noteon.data as { note: number }).note)).toBe(true)
      }
    })
  })

  describe('getVerbalFeedback', () => {
    it('names the played note and points toward a higher target', () => {
      const challenge = new SingleNoteEarTraining(67) // G
      expect(challenge.getVerbalFeedback('incorrect', response(60))).toBe('C. My note is higher!')
    })

    it('names the played note and points toward a lower target', () => {
      const challenge = new SingleNoteEarTraining(60) // C
      expect(challenge.getVerbalFeedback('incorrect', response(64))).toBe('E. My note is lower!')
    })

    it('names accidentals with "sharp"', () => {
      const challenge = new SingleNoteEarTraining(67)
      expect(challenge.getVerbalFeedback('incorrect', response(61))).toBe('C sharp. My note is higher!')
    })

    it('uses pitch-class names regardless of octave', () => {
      const challenge = new SingleNoteEarTraining(60)
      // played the right pitch class an octave up: still incorrect, named C, target is lower
      expect(challenge.getVerbalFeedback('incorrect', response(72))).toBe('C. My note is lower!')
    })

    it('stays silent on correct answers', () => {
      const challenge = new SingleNoteEarTraining(60)
      expect(challenge.getVerbalFeedback('correct', response(60))).toBeUndefined()
    })

    it('stays silent when no response was observed', () => {
      const challenge = new SingleNoteEarTraining(60)
      expect(challenge.getVerbalFeedback('incorrect')).toBeUndefined()
    })
  })
})
