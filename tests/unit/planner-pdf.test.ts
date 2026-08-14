import { describe, expect, it } from 'vitest'
import {
  buildPlannerPdf,
  PlannerPdfDay,
  PlannerPdfMatch
} from '@/app/(protected)/(tournaments)/components/TournamentPlannerView/exportPdf'

/** The generator writes uncompressed streams, so the file reads back as latin1 text. */
const asText = (bytes: Uint8Array): string => Buffer.from(bytes).toString('latin1')
/** Undoes encodePdfString's escaping of literal '(', ')' and '\' inside a PDF string literal. */
const unescapePdfString = (text: string): string => text.replace(/\\([()\\])/g, '$1')

/** Every string the document draws, in order (`(...) Tj` operators). */
function drawnText(bytes: Uint8Array): string[] {
  return [...asText(bytes).matchAll(/\((.*?)\) Tj/g)].map((found) => unescapePdfString(found[1]))
}

/** Baseline y of every drawn string, in PDF coordinates (larger is higher up). */
function drawnBaselines(bytes: Uint8Array): { text: string; y: number }[] {
  return [...asText(bytes).matchAll(/1 0 0 1 [\d.]+ ([\d.]+) Tm\n\((.*?)\) Tj/g)].map((found) => ({
    text: unescapePdfString(found[2]),
    y: Number(found[1])
  }))
}

/**
 * Heights of the teal header strips painted over the match cells. They are the
 * only fill-only rectangles in that colour (the time column is filled AND
 * stroked, so it closes with `B` instead of `f`).
 */
function stripHeights(bytes: Uint8Array): number[] {
  return [...asText(bytes).matchAll(/0\.07 0\.37 0\.35 rg\n[\d.]+ [\d.]+ [\d.]+ ([\d.]+) re\nf\n/g)].map((found) =>
    Number(found[1])
  )
}

const match = (overrides: Partial<PlannerPdfMatch> = {}): PlannerPdfMatch => ({
  category: 'Cuarta',
  round: 'Semifinal',
  home: 'Amengual',
  away: 'Gutierrez',
  ...overrides
})
const day = (times: string[], cells: (PlannerPdfMatch | null)[][]): PlannerPdfDay => ({
  heading: 'Sábado 2 de agosto',
  slots: times.map((time, index) => ({
    time,
    cells: (cells[index] ?? []).map((cell) => (cell ? [cell] : []))
  }))
})

describe('planner PDF — venue', () => {
  it('prints the venue on the header band', () => {
    const pdf = buildPlannerPdf('Torneo Apertura', 'Club Náutico', ['Cancha 1'], [day(['09:00'], [[match()]])])

    expect(drawnText(pdf)).toContain('Sede: Club N\xe1utico')
  })

  it('omits the venue line when there is no site selected', () => {
    const pdf = buildPlannerPdf('Torneo Apertura', null, ['Cancha 1'], [day(['09:00'], [[match()]])])

    expect(drawnText(pdf).some((text) => text.startsWith('Sede:'))).toBe(false)
  })

  it('repeats the venue on every page', () => {
    // Enough rows to overflow an A4 landscape page.
    const times = Array.from({ length: 14 }, (_, index) => `${String(8 + index).padStart(2, '0')}:00`)
    const pdf = buildPlannerPdf(
      'Torneo Apertura',
      'Club Náutico',
      ['Cancha 1', 'Cancha 2'],
      [
        day(
          times,
          times.map(() => [match(), match()])
        )
      ]
    )
    const pageCount = Number(/\/Count (\d+)/.exec(asText(pdf))![1])
    const venueMentions = drawnText(pdf).filter((text) => text === 'Sede: Club N\xe1utico').length

    expect(pageCount).toBeGreaterThan(1)
    expect(venueMentions).toBe(pageCount)
  })
})

describe('planner PDF — uniform match headers', () => {
  it('gives every cell the same header height, consolation or not', () => {
    const pdf = buildPlannerPdf(
      'Torneo Apertura',
      'Club Náutico',
      ['Cancha 1', 'Cancha 2'],
      [
        day(
          ['09:00', '10:30'],
          [
            [match(), match({ consolation: true })],
            [match({ category: 'Primera caballeros mayores de 45' }), match({ round: '—' })]
          ]
        )
      ]
    )
    const heights = stripHeights(pdf)

    expect(heights.length).toBe(4)
    expect(new Set(heights).size).toBe(1)
  })

  it('keeps the round label and the consolation chip on one line', () => {
    const plain = stripHeights(buildPlannerPdf('T', null, ['Cancha 1'], [day(['09:00'], [[match()]])]))[0]
    const withChip = stripHeights(
      buildPlannerPdf('T', null, ['Cancha 1'], [day(['09:00'], [[match({ consolation: true })]])])
    )[0]

    // The chip is 12pt tall against the round line's 9.5pt: sharing the line
    // costs 2.5pt, whereas stacking it would cost a full 12pt line.
    expect(withChip - plain).toBeCloseTo(2.5, 5)
  })
})

describe('planner PDF — vertical centring', () => {
  // Long enough to wrap onto two lines in a three-court layout.
  const wrapping = match({
    home: 'Ganador de Amengual Rodriguez / Perez vs Gutierrez / Muñoz Fernandez',
    away: 'Ganador de Gonzales Martinez / Rossi vs Capretti / Bianchi Lopez'
  })
  const short = match({ home: 'Lopez', away: 'Diaz' })

  it('centres a short match against a wrapping one in the same slot', () => {
    const pdf = buildPlannerPdf(
      'T',
      null,
      ['Cancha 1', 'Cancha 2', 'Cancha 3'],
      [day(['09:00'], [[wrapping, short, null]])]
    )
    // Both cells have as many home lines as away lines, so their "vs" marker
    // sits exactly at the centre of their players block.
    const centres = drawnBaselines(pdf)
      .filter((item) => item.text === 'vs')
      .map((item) => item.y)

    expect(centres.length).toBe(2)
    expect(centres[0]).toBeCloseTo(centres[1], 5)
  })

  it('still centres when nothing in the row wraps', () => {
    const pdf = buildPlannerPdf('T', null, ['Cancha 1', 'Cancha 2'], [day(['09:00'], [[short, short]])])
    const centres = drawnBaselines(pdf)
      .filter((item) => item.text === 'vs')
      .map((item) => item.y)

    expect(centres.length).toBe(2)
    expect(centres[0]).toBeCloseTo(centres[1], 5)
  })
})

describe('planner PDF — seeds', () => {
  it('draws the seed appended at the end of the name, in parentheses', () => {
    const seeded = match({ home: 'L. Amengual / E. Martinez (2)', away: 'P. Perez / M. Gomez' })
    const pdf = buildPlannerPdf('T', null, ['Cancha 1'], [day(['09:00'], [[seeded]])])

    expect(drawnText(pdf)).toContain('L. Amengual / E. Martinez (2)')
  })
})

describe('planner PDF — time column', () => {
  it('states the first slot of the day plainly and qualifies the rest', () => {
    const pdf = buildPlannerPdf(
      'Torneo Apertura',
      null,
      ['Cancha 1'],
      [day(['09:00', '10:30', '12:00'], [[match()], [match()], [match()]])]
    )
    const texts = drawnText(pdf)

    expect(texts).toContain('09:00')
    expect(texts).toContain('10:30')
    expect(texts).toContain('12:00')
    // One qualifier per slot after the first.
    expect(texts.filter((text) => text === 'No antes de').length).toBe(2)
    // The day's opening time is never qualified.
    expect(texts.indexOf('09:00')).toBeLessThan(texts.indexOf('No antes de'))
  })

  it('qualifies each day independently', () => {
    const pdf = buildPlannerPdf(
      'Torneo Apertura',
      null,
      ['Cancha 1'],
      [day(['09:00', '10:30'], [[match()], [match()]]), day(['09:00', '10:30'], [[match()], [match()]])]
    )

    expect(drawnText(pdf).filter((text) => text === 'No antes de').length).toBe(2)
  })

  it('does not qualify a slot reached after a gap longer than the match duration', () => {
    // 90-minute matches at 10:00, 11:30 and 13:00 chain back-to-back (each
    // ends exactly when the next starts), so 11:30 and 13:00 are qualified.
    // 16:30 follows a real gap — the 13:00 match ends at 14:30, two hours
    // before 16:30 — so it states a fixed time. 18:00 chains onto 16:30 again
    // (16:30 + 90 = 18:00), so it's qualified once more.
    const pdf = buildPlannerPdf(
      'Torneo Apertura',
      null,
      ['Cancha 1'],
      [
        day(
          ['10:00', '11:30', '13:00', '16:30', '18:00'],
          [[match()], [match()], [match()], [match()], [match()]]
        )
      ],
      null,
      90
    )
    const texts = drawnText(pdf)

    expect(texts.filter((text) => text === 'No antes de').length).toBe(3)
    // 16:30 is not immediately preceded by the qualifier, unlike 11:30, 13:00 and 18:00.
    expect(texts[texts.indexOf('16:30') - 1]).not.toBe('No antes de')
    expect(texts[texts.indexOf('11:30') - 1]).toBe('No antes de')
    expect(texts[texts.indexOf('13:00') - 1]).toBe('No antes de')
    expect(texts[texts.indexOf('18:00') - 1]).toBe('No antes de')
  })

  it('qualifies based on the duration passed in, not a fixed assumption', () => {
    // With 60-minute matches, 10:00 -> 11:00 chains (qualified) but
    // 11:00 -> 12:30 leaves a 30-minute gap (not qualified).
    const pdf = buildPlannerPdf(
      'Torneo Apertura',
      null,
      ['Cancha 1'],
      [day(['10:00', '11:00', '12:30'], [[match()], [match()], [match()]])],
      null,
      60
    )
    const texts = drawnText(pdf)

    expect(texts.filter((text) => text === 'No antes de').length).toBe(1)
    expect(texts[texts.indexOf('11:00') - 1]).toBe('No antes de')
    expect(texts[texts.indexOf('12:30') - 1]).not.toBe('No antes de')
  })
})
