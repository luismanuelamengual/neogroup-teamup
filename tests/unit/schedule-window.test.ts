import { describe, expect, it } from 'vitest'
import { resolveScheduleDays } from '@/app/(protected)/(tournaments)/utils/schedule'

/**
 * The window the published schedule covers (see utils/schedule.ts): the first
 * day with matches inside the week ahead, and from there every day of play
 * until two consecutive empty ones close the block.
 *
 * These are the rules a player feels but never sees, so they are pinned down
 * here rather than through the component: the whole point of the derivation is
 * that nobody chooses the range, which makes "why is Sunday missing?" a
 * question only this test can answer.
 */
describe('published schedule window', () => {
  const TODAY = '2026-08-18'

  it('has nothing to show when nothing is planned', () => {
    expect(resolveScheduleDays([], TODAY)).toEqual([])
  })

  it('starts at today when today has matches', () => {
    expect(resolveScheduleDays([TODAY], TODAY)).toEqual([TODAY])
  })

  it('finds the first day of play inside the week ahead', () => {
    // Nothing until Friday, three days out.
    expect(resolveScheduleDays(['2026-08-21'], TODAY)).toEqual(['2026-08-21'])
  })

  it('takes the last day of the week ahead', () => {
    // Day 7 counting today as the first: still inside the window.
    expect(resolveScheduleDays(['2026-08-24'], TODAY)).toEqual(['2026-08-24'])
  })

  it('ignores play that is further out than a week', () => {
    // Day 8: the tournament is planned, but not yet worth publishing — it will
    // appear on its own tomorrow.
    expect(resolveScheduleDays(['2026-08-25'], TODAY)).toEqual([])
  })

  it('ignores days already played', () => {
    expect(resolveScheduleDays(['2026-08-16', '2026-08-17'], TODAY)).toEqual([])
  })

  it('keeps consecutive days together', () => {
    const days = ['2026-08-19', '2026-08-20', '2026-08-21']

    expect(resolveScheduleDays(days, TODAY)).toEqual(days)
  })

  it('bridges a single empty day and drops it from the result', () => {
    // Saturday and Monday: one day off is still the same block of play, but a
    // day with nothing on it is not printed.
    expect(resolveScheduleDays(['2026-08-22', '2026-08-24'], TODAY)).toEqual(['2026-08-22', '2026-08-24'])
  })

  it('stops at two empty days in a row', () => {
    // The 25th and 26th are empty, so the 27th belongs to the next block and
    // will be published once it is itself within the week ahead.
    expect(resolveScheduleDays(['2026-08-22', '2026-08-24', '2026-08-27'], TODAY)).toEqual(['2026-08-22', '2026-08-24'])
  })

  it('follows a long block past the week it started in', () => {
    // The lookahead only picks the first day; from there the block runs as long
    // as the play does, even weeks out.
    const days = ['2026-08-20', '2026-08-21', '2026-08-22', '2026-08-23', '2026-08-24', '2026-08-25', '2026-08-26']

    expect(resolveScheduleDays(days, TODAY)).toEqual(days)
  })

  it('crosses a month boundary', () => {
    expect(resolveScheduleDays(['2026-08-31', '2026-09-01'], '2026-08-30')).toEqual(['2026-08-31', '2026-09-01'])
  })

  it('is unaffected by the order dates come in, or by duplicates', () => {
    const dates = ['2026-08-21', '2026-08-19', '2026-08-21', '2026-08-20']

    expect(resolveScheduleDays(dates, TODAY)).toEqual(['2026-08-19', '2026-08-20', '2026-08-21'])
  })

  it('ignores malformed dates', () => {
    expect(resolveScheduleDays(['', 'tomorrow', '2026-8-19'], TODAY)).toEqual([])
    expect(resolveScheduleDays(['2026-08-19'], 'today')).toEqual([])
  })
})
