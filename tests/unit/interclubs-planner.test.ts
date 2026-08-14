import { describe, expect, it } from 'vitest'
import {
  buildInterclubsPdf,
  InterclubsPdfDay,
  InterclubsPdfSeries
} from '@/app/(protected)/(tournaments)/components/InterclubsPlannerView/exportPdf'

/** The generator writes uncompressed streams, so the file reads back as latin1 text. */
const asText = (bytes: Uint8Array): string => Buffer.from(bytes).toString('latin1')
/** Undoes the escaping of literal '(', ')' and '\' inside a PDF string literal. */
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

const series = (overrides: Partial<InterclubsPdfSeries> = {}): InterclubsPdfSeries => ({
  time: '10:00',
  category: 'Damas 30 C',
  round: 'Zona única · Fecha 3',
  home: 'Andino',
  away: 'Rivadavia',
  ...overrides
})
const day = (series: InterclubsPdfSeries[], venue: string | null = null): InterclubsPdfDay => ({
  heading: 'Domingo 5 de julio',
  venue,
  series
})

describe('interclubes PDF — programme layout', () => {
  it('draws the four columns of the programme', () => {
    const pdf = buildInterclubsPdf('Interclubes Tour de Maestros', [day([series()], 'Andino Tenis Club')])
    const texts = drawnText(pdf)

    expect(texts).toContain('HORA')
    expect(texts).toContain('CATEGOR\xcdA')
    expect(texts).toContain('SERIE')
    expect(texts).toContain('RONDA')
  })

  it('lists a series with its hour, category, teams and round', () => {
    const pdf = buildInterclubsPdf('Interclubes', [day([series()], 'Andino Tenis Club')])
    const texts = drawnText(pdf)

    expect(texts).toContain('10:00')
    expect(texts).toContain('DAMAS 30 C')
    expect(texts).toContain('Andino')
    expect(texts).toContain('Rivadavia')
    expect(texts).toContain('ZONA \xdaNICA \xb7 FECHA 3')
  })

  it('heads each day with its date and each table with its venue', () => {
    const pdf = buildInterclubsPdf('Interclubes', [day([series()], 'Andino Tenis Club')])
    const texts = drawnText(pdf)

    expect(texts).toContain('DOMINGO 5 DE JULIO')
    expect(texts).toContain('SEDE: Andino Tenis Club')
  })

  it('says nothing about the venue when each series is at its home club', () => {
    const pdf = buildInterclubsPdf('Interclubes', [day([series(), series({ home: 'Regatas', away: 'Palmares' })])])
    const texts = drawnText(pdf)

    // No venue was chosen, so the programme is read as "cada uno en su sede".
    expect(texts.some((text) => text.startsWith('SEDE:'))).toBe(false)
    // Still a single table for the day, not one per club.
    expect(texts.filter((text) => text === 'HORA').length).toBe(1)
  })

  it('lists a whole day of one club under a single venue band', () => {
    const pdf = buildInterclubsPdf('Interclubes', [
      day([series(), series({ home: 'Regatas', away: 'Palmares' })], 'Andino Tenis Club')
    ])
    const texts = drawnText(pdf)

    expect(texts.filter((text) => text.startsWith('SEDE:'))).toEqual(['SEDE: Andino Tenis Club'])
    expect(texts.filter((text) => text === 'HORA').length).toBe(1)
  })

  it('flags a consolation series', () => {
    const pdf = buildInterclubsPdf('Interclubes', [day([series({ round: 'Final', consolation: true })])])

    expect(drawnText(pdf)).toContain('CONSUELO')
  })

  it('repeats the day and venue headings when the table spills onto a new page', () => {
    const many = Array.from({ length: 40 }, (_, index) =>
      series({ time: `${String(8 + (index % 12)).padStart(2, '0')}:00` })
    )
    const pdf = buildInterclubsPdf('Interclubes', [day(many, 'Andino Tenis Club')])
    const pageCount = Number(/\/Count (\d+)/.exec(asText(pdf))![1])
    const texts = drawnText(pdf)

    expect(pageCount).toBeGreaterThan(1)
    expect(texts.filter((text) => text.startsWith('SEDE:')).length).toBe(pageCount)
    expect(texts.filter((text) => text.startsWith('DOMINGO 5 DE JULIO')).length).toBe(pageCount)
    // Every continuation says so, so a loose page is never read as the start of a day.
    expect(texts.filter((text) => text.includes('CONTINUACI\xd3N')).length).toBe(pageCount - 1)
  })

  it('states a real hour on every row, unlike the court planner', () => {
    const pdf = buildInterclubsPdf('Interclubes', [
      day([series({ time: '10:00' }), series({ time: '11:30' }), series({ time: '14:30' })])
    ])
    const texts = drawnText(pdf)

    // Each series is at its own club, so its start time is a promise the
    // programme can keep — there is no "no antes de" qualifier here.
    expect(texts).toContain('10:00')
    expect(texts).toContain('11:30')
    expect(texts).toContain('14:30')
    expect(texts.some((text) => text === 'No antes de')).toBe(false)
  })

  it('draws both teams of a series on the same line', () => {
    const pdf = buildInterclubsPdf('Interclubes', [day([series({ home: 'Andino', away: 'Regatas' })])])
    const baselines = drawnBaselines(pdf)
    const home = baselines.find((item) => item.text === 'Andino' && item.y < 800)!
    const away = baselines.find((item) => item.text === 'Regatas')!
    const vs = baselines.find((item) => item.text === 'vs')!

    expect(home.y).toBeCloseTo(away.y, 5)
    // The "vs" is set smaller, so its baseline sits a hair below the names it
    // separates — both are centred on their capitals, not on their line boxes.
    expect(Math.abs(vs.y - home.y)).toBeLessThan(2)
  })

  it('lets a long team name wrap without pushing the row apart', () => {
    const pdf = buildInterclubsPdf('Interclubes', [
      day([series({ home: 'Gdor. Campo Tunuyan - Maipú', away: 'Regatas' })])
    ])
    const baselines = drawnBaselines(pdf)
    const away = baselines.find((item) => item.text === 'Regatas')!
    const vs = baselines.find((item) => item.text === 'vs')!

    // The visitor fits on one line, so it stays centred on the row even though
    // the home team wrapped onto two.
    expect(Math.abs(away.y - vs.y)).toBeLessThan(2)
  })
})
