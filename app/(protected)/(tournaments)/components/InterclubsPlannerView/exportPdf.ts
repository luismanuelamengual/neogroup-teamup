// PDF export of the interclubes planner — the "programación" sheet clubs pin on
// the wall and share on WhatsApp.
//
// It deliberately does NOT reuse the court×time grid of the regular planner: an
// interclubes day is a list of series, and the printed programmes everybody
// already reads are a four-column table — hour, category, the series itself and
// the round it belongs to. A venue band only appears on the days gathered at a
// single club (typically the finals); the rest of the season is played at each
// home team's own club, so the programme says nothing about the venue because
// there is nothing to say. What is shared with the regular planner is the look:
// the same teal/amber palette and the same branded header (see app/utils/pdf.ts).

import {
  A4_PORTRAIT,
  assemblePdf,
  BRAND_HEADER_HEX,
  capBottom,
  capTop,
  centerTextIn,
  DOC_COLORS as COLORS,
  downloadPdfBytes,
  loadBrowserLogo,
  measureText,
  Painter,
  PdfLogo,
  slugify,
  wrapText
} from '@/app/utils/pdf'

/* --------------------------------------------------------------------------
 * Page geometry
 * ------------------------------------------------------------------------ */

const PAGE_WIDTH = A4_PORTRAIT.width
const PAGE_HEIGHT = A4_PORTRAIT.height
const MARGIN = 26
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const BRAND_HEADER_HEIGHT = 60
const DAY_HEADING_HEIGHT = 26
const VENUE_HEADING_HEIGHT = 20
const COLUMN_HEADER_HEIGHT = 20
const FOOTER_HEIGHT = 16
/** Column widths; the series column takes whatever is left. */
const TIME_COL_WIDTH = 56
const CATEGORY_COL_WIDTH = 92
const ROUND_COL_WIDTH = 118
const SERIES_COL_WIDTH = CONTENT_WIDTH - TIME_COL_WIDTH - CATEGORY_COL_WIDTH - ROUND_COL_WIDTH
const CELL_PAD = 5
const MIN_ROW_HEIGHT = 26
/** Vertical padding above and below a row's tallest content. */
const ROW_PAD = 6
/* Type sizes --------------------------------------------------------------- */
const TIME_SIZE = 11
const CATEGORY_SIZE = 8
const TEAM_SIZE = 9.5
const VS_SIZE = 7
const ROUND_SIZE = 8
const TEAM_LINE = 11
const CATEGORY_LINE = 9.5
const ROUND_LINE = 9.5
/** Width of the "vs" gutter that separates the two teams of a series. */
const VS_GUTTER = 26
const CONSOLATION_CHIP_LABEL = 'CONSUELO'
const CONSOLATION_CHIP_SIZE = 6.5
const CONSOLATION_CHIP_HEIGHT = 10
/** Gap between the round label and the consolation chip below it. */
const CHIP_GAP = 3

/* --------------------------------------------------------------------------
 * Data shapes
 * ------------------------------------------------------------------------ */

/** One series (encuentro) of the programme: a row of the table. */
export interface InterclubsPdfSeries {
  /** Start time, 'HH:mm'. */
  time: string
  category: string
  /** Zone + fixture, or the knockout stage. Empty when the match has neither. */
  round: string
  /** Home team — the one hosting, i.e. the club the venue band names. */
  home: string
  away: string
  /** True when the series belongs to the consolation knockout bracket. */
  consolation?: boolean
}

export interface InterclubsPdfDay {
  heading: string
  /**
   * Club everything of this day is played at, named right under the date.
   *
   * Null is the ordinary case rather than missing data: interclubes is normally
   * played at the home team's own club, so there is no single venue to print
   * and none is expected — the programme is read as "cada uno en su sede". It
   * only carries a name on the days the organizer gathers every series at one
   * club, typically the finals.
   */
  venue: string | null
  /** The day's series, in the order they are printed (by hour). */
  series: InterclubsPdfSeries[]
}

/* --------------------------------------------------------------------------
 * Row layout
 * ------------------------------------------------------------------------ */

/** Width available for one team's name, inside the series column. */
const teamWidth = (): number => (SERIES_COL_WIDTH - VS_GUTTER) / 2 - CELL_PAD * 2

interface RowLayout {
  categoryLines: string[]
  roundLines: string[]
  homeLines: string[]
  awayLines: string[]
  consolation: boolean
  height: number
}

function layoutRow(series: InterclubsPdfSeries): RowLayout {
  const categoryLines = wrapText(
    series.category.toUpperCase(),
    CATEGORY_SIZE,
    true,
    CATEGORY_COL_WIDTH - CELL_PAD * 2,
    2
  )
  const roundLines = wrapText(series.round.toUpperCase(), ROUND_SIZE, true, ROUND_COL_WIDTH - CELL_PAD * 2, 2)
  const homeLines = wrapText(series.home, TEAM_SIZE, true, teamWidth(), 2)
  const awayLines = wrapText(series.away, TEAM_SIZE, true, teamWidth(), 2)
  const consolation = series.consolation === true
  const content = Math.max(
    categoryLines.length * CATEGORY_LINE,
    roundLines.length * ROUND_LINE + (consolation ? CHIP_GAP + CONSOLATION_CHIP_HEIGHT : 0),
    Math.max(homeLines.length, awayLines.length) * TEAM_LINE
  )

  return {
    categoryLines,
    roundLines,
    homeLines,
    awayLines,
    consolation,
    height: Math.max(MIN_ROW_HEIGHT, ROW_PAD + content + ROW_PAD)
  }
}

/**
 * Height of the ink a block of lines puts on the page, from the top of the
 * first capital to the bottom of the last one (see capTop/capBottom: centring
 * on the line boxes instead would leave every cell looking slightly high).
 */
const blockInk = (lineCount: number, lineHeight: number, size: number): number =>
  lineCount === 0 ? 0 : (lineCount - 1) * lineHeight + capTop(size) + capBottom(size)
/** The `top` of the first line box that vertically centres a block of lines in a row. */
const blockTop = (rowTop: number, rowHeight: number, lineCount: number, lineHeight: number, size: number): number =>
  rowTop + rowHeight / 2 - blockInk(lineCount, lineHeight, size) / 2 - capTop(size)

/* --------------------------------------------------------------------------
 * Document assembly
 * ------------------------------------------------------------------------ */

interface BuildContext {
  tournamentName: string
  subtitle: string
  logo: PdfLogo | null
}

class InterclubsDocument {
  private readonly pages: Painter[] = []
  private painter!: Painter
  private cursorTop = 0
  /** Alternates the row background down a day's table, page breaks included. */
  private rowIndex = 0

  private readonly topStart = MARGIN + BRAND_HEADER_HEIGHT + 14
  private readonly bottomLimit = PAGE_HEIGHT - MARGIN - FOOTER_HEIGHT

  constructor(private readonly ctx: BuildContext) {
    this.newPage()
  }

  private newPage(): void {
    this.painter = new Painter(PAGE_HEIGHT)
    this.pages.push(this.painter)
    this.drawBrandHeader()
    this.cursorTop = this.topStart
  }

  private drawBrandHeader(): void {
    const p = this.painter

    p.rect(MARGIN, MARGIN, CONTENT_WIDTH, BRAND_HEADER_HEIGHT, { fill: COLORS.teal, radius: 10 })

    // The white "bar" logo sits directly on the teal band (no chip). It was
    // composited over the same teal, so its transparent areas blend seamlessly.
    const logoLeft = MARGIN + 18
    let logoBlockWidth = 130

    if (this.ctx.logo) {
      const drawHeight = 28
      const drawWidth = (this.ctx.logo.width / this.ctx.logo.height) * drawHeight

      logoBlockWidth = drawWidth
      p.image(logoLeft, MARGIN + (BRAND_HEADER_HEIGHT - drawHeight) / 2, drawWidth, drawHeight)
    } else {
      p.text(logoLeft, MARGIN + BRAND_HEADER_HEIGHT / 2 - 11, 'TEAMUP', { size: 22, bold: true, color: COLORS.white })
    }

    const textX = logoLeft + logoBlockWidth + 18
    const textWidth = CONTENT_WIDTH - (textX - MARGIN) - 14

    p.text(textX, MARGIN + 14, this.ctx.tournamentName, {
      size: 15,
      bold: true,
      color: COLORS.white,
      maxWidth: textWidth
    })
    p.text(textX, MARGIN + 34, this.ctx.subtitle, { size: 8.5, color: COLORS.amberSoft, maxWidth: textWidth })
  }

  private drawDayHeading(heading: string, continued: boolean): void {
    const p = this.painter
    const label = continued ? `${heading.toUpperCase()}  ·  CONTINUACIÓN` : heading.toUpperCase()

    p.rect(MARGIN, this.cursorTop, CONTENT_WIDTH, DAY_HEADING_HEIGHT, { fill: COLORS.amber, radius: 5 })
    p.text(MARGIN + CONTENT_WIDTH / 2, this.cursorTop + DAY_HEADING_HEIGHT / 2 - 6, label, {
      size: 12,
      bold: true,
      color: COLORS.ink,
      align: 'center',
      maxWidth: CONTENT_WIDTH - 24
    })
    this.cursorTop += DAY_HEADING_HEIGHT + 5
  }

  /** Teal band naming the club that hosts the series listed under it. */
  private drawVenueHeading(name: string): void {
    const p = this.painter

    p.rect(MARGIN, this.cursorTop, CONTENT_WIDTH, VENUE_HEADING_HEIGHT, { fill: COLORS.teal, radius: 4 })
    p.text(MARGIN + CONTENT_WIDTH / 2, centerTextIn(this.cursorTop, VENUE_HEADING_HEIGHT, 10), `SEDE: ${name}`, {
      size: 10,
      bold: true,
      color: COLORS.white,
      align: 'center',
      maxWidth: CONTENT_WIDTH - 24
    })
    this.cursorTop += VENUE_HEADING_HEIGHT + 4
  }

  private drawColumnHeader(): void {
    const p = this.painter
    const top = this.cursorTop
    const columns: [string, number, number][] = [
      ['HORA', MARGIN, TIME_COL_WIDTH],
      ['CATEGORÍA', MARGIN + TIME_COL_WIDTH, CATEGORY_COL_WIDTH],
      ['SERIE', MARGIN + TIME_COL_WIDTH + CATEGORY_COL_WIDTH, SERIES_COL_WIDTH],
      ['RONDA', MARGIN + TIME_COL_WIDTH + CATEGORY_COL_WIDTH + SERIES_COL_WIDTH, ROUND_COL_WIDTH]
    ]

    for (const [label, x, width] of columns) {
      p.rect(x, top, width, COLUMN_HEADER_HEIGHT, { fill: COLORS.tealDeep, stroke: COLORS.tealDeep, lineWidth: 0.5 })
      p.text(x + width / 2, centerTextIn(top, COLUMN_HEADER_HEIGHT, 8.5), label, {
        size: 8.5,
        bold: true,
        color: COLORS.white,
        align: 'center',
        maxWidth: width - 8
      })
    }

    this.cursorTop += COLUMN_HEADER_HEIGHT
  }

  private drawRow(series: InterclubsPdfSeries, layout: RowLayout): void {
    const p = this.painter
    const top = this.cursorTop
    const height = layout.height
    const bg = this.rowIndex % 2 === 0 ? COLORS.cellBg : COLORS.rowAlt
    const timeX = MARGIN
    const categoryX = timeX + TIME_COL_WIDTH
    const seriesX = categoryX + CATEGORY_COL_WIDTH
    const roundX = seriesX + SERIES_COL_WIDTH

    // Hour — the only cell that keeps the teal fill, so the eye can run down the
    // left edge of the sheet looking for a time.
    p.rect(timeX, top, TIME_COL_WIDTH, height, { fill: COLORS.tealDark, stroke: COLORS.tealDeep, lineWidth: 0.5 })
    p.text(timeX + TIME_COL_WIDTH / 2, centerTextIn(top, height, TIME_SIZE), series.time, {
      size: TIME_SIZE,
      bold: true,
      color: COLORS.white,
      align: 'center'
    })

    p.rect(categoryX, top, CATEGORY_COL_WIDTH, height, { fill: bg, stroke: COLORS.border, lineWidth: 0.5 })

    let categoryTop = blockTop(top, height, layout.categoryLines.length, CATEGORY_LINE, CATEGORY_SIZE)

    for (const line of layout.categoryLines) {
      p.text(categoryX + CATEGORY_COL_WIDTH / 2, categoryTop, line, {
        size: CATEGORY_SIZE,
        bold: true,
        color: COLORS.tealDark,
        align: 'center'
      })
      categoryTop += CATEGORY_LINE
    }

    // Series: the two teams facing each other across a "vs" gutter, so the
    // column reads as a fixture rather than as two unrelated names.
    p.rect(seriesX, top, SERIES_COL_WIDTH, height, { fill: bg, stroke: COLORS.border, lineWidth: 0.5 })

    const homeCenter = seriesX + (SERIES_COL_WIDTH - VS_GUTTER) / 4
    const awayCenter = seriesX + SERIES_COL_WIDTH - (SERIES_COL_WIDTH - VS_GUTTER) / 4
    let homeTop = blockTop(top, height, layout.homeLines.length, TEAM_LINE, TEAM_SIZE)
    let awayTop = blockTop(top, height, layout.awayLines.length, TEAM_LINE, TEAM_SIZE)

    for (const line of layout.homeLines) {
      p.text(homeCenter, homeTop, line, { size: TEAM_SIZE, bold: true, color: COLORS.ink, align: 'center' })
      homeTop += TEAM_LINE
    }

    for (const line of layout.awayLines) {
      p.text(awayCenter, awayTop, line, { size: TEAM_SIZE, bold: true, color: COLORS.ink, align: 'center' })
      awayTop += TEAM_LINE
    }

    p.text(seriesX + SERIES_COL_WIDTH / 2, centerTextIn(top, height, VS_SIZE), 'vs', {
      size: VS_SIZE,
      color: COLORS.muted,
      align: 'center'
    })

    // Round, with the consolation chip underneath when the series belongs to
    // the secondary bracket.
    p.rect(roundX, top, ROUND_COL_WIDTH, height, { fill: bg, stroke: COLORS.border, lineWidth: 0.5 })

    const linesInk = blockInk(layout.roundLines.length, ROUND_LINE, ROUND_SIZE)
    const chipGap = layout.consolation && linesInk > 0 ? CHIP_GAP : 0
    const chipInk = layout.consolation ? chipGap + CONSOLATION_CHIP_HEIGHT : 0
    // Top of the whole block's ink — the label lines and, under them, the chip.
    const roundInkTop = top + height / 2 - (linesInk + chipInk) / 2
    let roundTop = roundInkTop - capTop(ROUND_SIZE)

    for (const line of layout.roundLines) {
      p.text(roundX + ROUND_COL_WIDTH / 2, roundTop, line, {
        size: ROUND_SIZE,
        bold: true,
        color: COLORS.ink,
        align: 'center'
      })
      roundTop += ROUND_LINE
    }

    if (layout.consolation) {
      const chipWidth = measureText(CONSOLATION_CHIP_LABEL, CONSOLATION_CHIP_SIZE, true) + 10
      const chipTop = roundInkTop + linesInk + chipGap
      const chipX = roundX + ROUND_COL_WIDTH / 2 - chipWidth / 2

      p.rect(chipX, chipTop, chipWidth, CONSOLATION_CHIP_HEIGHT, { fill: COLORS.amber, radius: 2 })
      p.text(
        chipX + chipWidth / 2,
        centerTextIn(chipTop, CONSOLATION_CHIP_HEIGHT, CONSOLATION_CHIP_SIZE),
        CONSOLATION_CHIP_LABEL,
        { size: CONSOLATION_CHIP_SIZE, bold: true, color: COLORS.white, align: 'center' }
      )
    }

    this.cursorTop += height
    this.rowIndex++
  }

  addDay(day: InterclubsPdfDay): void {
    // Keep the day heading, its venue band, the column header and at least one
    // row together: a heading orphaned at the foot of a page is worse than a
    // break one row earlier.
    const headingBlock = DAY_HEADING_HEIGHT + 5 + (day.venue ? VENUE_HEADING_HEIGHT + 4 : 0)

    if (this.cursorTop + headingBlock + COLUMN_HEADER_HEIGHT + MIN_ROW_HEIGHT > this.bottomLimit) {
      this.newPage()
    }

    this.drawHeadings(day, false)

    if (day.series.length === 0) {
      this.painter.text(MARGIN + 12, this.cursorTop + 4, 'Sin partidos planificados.', { size: 9, color: COLORS.muted })
      this.cursorTop += 26

      return
    }

    this.drawColumnHeader()
    this.rowIndex = 0

    for (const series of day.series) {
      const layout = layoutRow(series)

      if (this.cursorTop + layout.height > this.bottomLimit) {
        this.newPage()
        this.drawHeadings(day, true)
        this.drawColumnHeader()
      }

      this.drawRow(series, layout)
    }

    this.cursorTop += 14
  }

  /** The date band and, when the whole day is played at one club, its venue band. */
  private drawHeadings(day: InterclubsPdfDay, continued: boolean): void {
    this.drawDayHeading(day.heading, continued)

    if (day.venue) {
      this.drawVenueHeading(day.venue)
    }
  }

  private drawFooters(): void {
    const total = this.pages.length

    this.pages.forEach((page, index) => {
      page.text(
        PAGE_WIDTH / 2,
        PAGE_HEIGHT - MARGIN - 4,
        `TeamUp · Programación de interclubes  —  Página ${index + 1} de ${total}`,
        { size: 7.5, color: COLORS.muted, align: 'center' }
      )
    })
  }

  finish(): Painter[] {
    this.drawFooters()

    return this.pages
  }
}

/** Pure builder: produces the PDF bytes. Exported so it can be exercised in tests. */
export function buildInterclubsPdf(
  tournamentName: string,
  days: InterclubsPdfDay[],
  logo: PdfLogo | null = null
): Uint8Array {
  const ctx: BuildContext = {
    tournamentName,
    subtitle: `Programación de series · Generado el ${new Date().toLocaleDateString('es-AR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })}`,
    logo
  }
  const doc = new InterclubsDocument(ctx)

  if (days.length === 0) {
    doc.addDay({ heading: 'Sin fechas planificadas', venue: null, series: [] })
  } else {
    days.forEach((day) => doc.addDay(day))
  }

  return assemblePdf(doc.finish(), A4_PORTRAIT, logo)
}

/**
 * Builds the interclubes programme (loading the org-resolved brand logo) and
 * triggers a browser download. `logoSrc` should come from
 * `resolveOrganizationImage`.
 */
export async function downloadInterclubsPdf(
  tournamentName: string,
  days: InterclubsPdfDay[],
  logoSrc?: string
): Promise<void> {
  const logo = logoSrc ? await loadBrowserLogo(logoSrc, BRAND_HEADER_HEX) : null

  downloadPdfBytes(
    buildInterclubsPdf(tournamentName, days, logo),
    `programacion-${slugify(tournamentName, 'interclubes')}.pdf`
  )
}
