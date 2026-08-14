// PDF export of the tournament planner.
//
// It draws a branded, colour-coded grid (courts as columns, time slots as rows)
// that mirrors the "orden de juego" sheets clubs are used to. The PDF machinery
// itself — painting, text metrics, encoding, file assembly — lives in
// app/utils/pdf.ts; this module only describes the layout.

import {
  A4_LANDSCAPE,
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
 * Page geometry & brand palette
 * ------------------------------------------------------------------------ */

const PAGE_WIDTH = A4_LANDSCAPE.width
const PAGE_HEIGHT = A4_LANDSCAPE.height
const MARGIN = 26
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const BRAND_HEADER_HEIGHT = 60
const DAY_HEADING_HEIGHT = 26
const COLUMN_HEADER_HEIGHT = 24
const TIME_COL_WIDTH = 58
const MIN_ROW_HEIGHT = 56
const FOOTER_HEIGHT = 16
const CELL_PAD = 5
/**
 * Qualifier drawn above a slot's start time when some match that day is
 * scheduled to end exactly as it begins — a planner can't promise a start
 * time for a court that may still be in use, so that row announces the
 * earliest a match can begin rather than a fixed hour. See `drawTimeCell`.
 */
const TIME_APPROX_LABEL = 'No antes de'
const TIME_APPROX_SIZE = 7
const TIME_APPROX_LINE = 9

/* --------------------------------------------------------------------------
 * Planner data shapes
 * ------------------------------------------------------------------------ */

export interface PlannerPdfMatch {
  category: string
  round: string
  home: string
  away: string
  /** True when the match belongs to the consolation knockout bracket. */
  consolation?: boolean
}

export interface PlannerPdfSlot {
  time: string
  /** One entry per court column; each is the list of matches placed in that cell. */
  cells: PlannerPdfMatch[][]
}

export interface PlannerPdfDay {
  heading: string
  slots: PlannerPdfSlot[]
}

/** Kept for callers that used to import the logo shape from here. */
export type PlannerPdfLogo = PdfLogo

/* --------------------------------------------------------------------------
 * Cell layout — measure how tall a match cell needs to be, and its text runs
 * ------------------------------------------------------------------------ */

const HEADER_CAT_SIZE = 7.5
const HEADER_ROUND_SIZE = 7
const PLAYER_SIZE = 8.5
const VS_SIZE = 7
const HEADER_LINE = 9.5
const PLAYER_LINE = 10.5
/** Height of the line holding the round label and/or the "CONSUELO" chip. */
const CONSOLATION_CHIP_LINE = 12
const CONSOLATION_CHIP_SIZE = 6.5
const CONSOLATION_CHIP_LABEL = 'CONSUELO'
const CONSOLATION_CHIP_HEIGHT = 10
/** Where the chip sits inside its line box, which is slightly taller than it. */
const CHIP_TOP_OFFSET = (CONSOLATION_CHIP_LINE - CONSOLATION_CHIP_HEIGHT) / 2
/** Gap between the round label and the chip when they share a line. */
const CHIP_GAP = 4
/** Vertical padding above and below the strip's content. */
const STRIP_PAD_TOP = 6
const STRIP_PAD_BOTTOM = 5
/** Strip height when there is nothing to measure (a document with no matches). */
const MIN_STRIP_HEIGHT = STRIP_PAD_TOP + HEADER_LINE + STRIP_PAD_BOTTOM
/** Padding above and below the players block, inside the cell's body area. */
const BODY_PAD = 8
/** Width of the "CONSUELO" chip, including its horizontal padding. */
const consolationChipWidth = (): number => measureText(CONSOLATION_CHIP_LABEL, CONSOLATION_CHIP_SIZE, true) + 10

interface CellLayout {
  categoryLines: string[]
  /** The round label, already fitted next to the chip when there is one. */
  roundLine: string
  homeLines: string[]
  awayLines: string[]
  consolation: boolean
  /**
   * Height this cell's own strip content needs. The strip actually painted is
   * the same for every cell of the document — see `measureStripHeight`.
   */
  stripContentHeight: number
  /**
   * Offset, from the strip's first line box, of the visual centre of everything
   * the strip draws. Subtracting it from the middle of the band is what centres
   * the header.
   */
  stripInkCenter: number
  /** Height of the players block itself, without the body padding around it. */
  bodyContentHeight: number
  /** Same as `stripInkCenter`, for the players block. */
  bodyInkCenter: number
  /** Total height the body area needs: the players block plus its padding. */
  bodyHeight: number
}

function layoutCell(match: PlannerPdfMatch, innerWidth: number): CellLayout {
  const categoryLines = wrapText(match.category.toUpperCase(), HEADER_CAT_SIZE, true, innerWidth, 2)
  const consolation = match.consolation === true
  // The chip shares the round's line rather than taking one of its own, so a
  // consolation match costs 2.5pt of extra strip instead of a whole line.
  const roundWidth = innerWidth - (consolation ? consolationChipWidth() + CHIP_GAP : 0)
  const roundLine =
    match.round && match.round !== '—' && roundWidth > 20
      ? (wrapText(match.round, HEADER_ROUND_SIZE, false, roundWidth, 1)[0] ?? '')
      : ''
  const homeLines = wrapText(match.home, PLAYER_SIZE, true, innerWidth, 2)
  const awayLines = wrapText(match.away, PLAYER_SIZE, true, innerWidth, 2)
  const stripContentHeight = categoryLines.length * HEADER_LINE + metaLineHeight(roundLine, consolation)
  const bodyContentHeight = homeLines.length * PLAYER_LINE + (VS_SIZE + 4) + awayLines.length * PLAYER_LINE
  const bodyHeight = BODY_PAD + bodyContentHeight + BODY_PAD
  // Bottom of the last thing the strip paints: the chip (a rectangle, so its own
  // height), the round label, or the final category line.
  const metaTop = categoryLines.length * HEADER_LINE
  const stripInkBottom = consolation
    ? metaTop + CHIP_TOP_OFFSET + CONSOLATION_CHIP_HEIGHT
    : roundLine !== ''
      ? metaTop + capBottom(HEADER_ROUND_SIZE)
      : (categoryLines.length - 1) * HEADER_LINE + capBottom(HEADER_CAT_SIZE)
  const bodyInkBottom =
    homeLines.length * PLAYER_LINE + (VS_SIZE + 4) + (awayLines.length - 1) * PLAYER_LINE + capBottom(PLAYER_SIZE)

  return {
    categoryLines,
    roundLine,
    homeLines,
    awayLines,
    consolation,
    stripContentHeight,
    stripInkCenter: (capTop(HEADER_CAT_SIZE) + stripInkBottom) / 2,
    bodyContentHeight,
    bodyInkCenter: (capTop(PLAYER_SIZE) + bodyInkBottom) / 2,
    bodyHeight
  }
}

/** Height of the round/chip line: zero when the cell has neither. */
function metaLineHeight(roundLine: string, consolation: boolean): number {
  if (consolation) {
    return CONSOLATION_CHIP_LINE
  }

  return roundLine === '' ? 0 : HEADER_LINE
}

/**
 * The tallest strip content in the whole document. Every cell is painted with a
 * strip of this height, so the coloured header bands line up across courts and
 * rows instead of each match sizing its own — a two-line category or a
 * consolation chip used to make a single cell visibly taller than its
 * neighbours.
 */
function measureStripHeight(days: PlannerPdfDay[], innerWidth: number): number {
  let content = 0

  for (const day of days) {
    for (const slot of day.slots) {
      for (const cell of slot.cells) {
        const match = cell[0]

        if (match) {
          content = Math.max(content, layoutCell(match, innerWidth).stripContentHeight)
        }
      }
    }
  }

  return Math.max(MIN_STRIP_HEIGHT, STRIP_PAD_TOP + content + STRIP_PAD_BOTTOM)
}

/** Parses a slot's 'HH:mm' label into minutes from midnight. */
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)

  return hours * 60 + minutes
}

/**
 * Every start time (in minutes) that has at least one match that day. Used to
 * check whether some match — on any court, not necessarily the row right
 * above — is scheduled to end exactly when a given slot begins.
 */
function slotStartMinutes(day: PlannerPdfDay): Set<number> {
  return new Set(day.slots.map((slot) => timeToMinutes(slot.time)))
}

/* --------------------------------------------------------------------------
 * Document assembly
 * ------------------------------------------------------------------------ */

interface BuildContext {
  tournamentName: string
  /** Venue the whole planning belongs to; shown on every page's header band. */
  venue: string | null
  subtitle: string
  courtLabels: string[]
  logo: PdfLogo | null
  courtColWidth: number
  /** Uniform header-strip height for every match cell (see measureStripHeight). */
  stripHeight: number
  /** Minutes every match occupies its court for — every match on the sheet shares one duration. */
  matchDurationMinutes: number
}

class PlannerDocument {
  private readonly pages: Painter[] = []
  private painter!: Painter
  private cursorTop = 0

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
    const logoLeft = MARGIN + 20
    let logoBlockWidth = 150

    if (this.ctx.logo) {
      const drawHeight = 30
      const drawWidth = (this.ctx.logo.width / this.ctx.logo.height) * drawHeight

      logoBlockWidth = drawWidth
      p.image(logoLeft, MARGIN + (BRAND_HEADER_HEIGHT - drawHeight) / 2, drawWidth, drawHeight)
    } else {
      p.text(logoLeft, MARGIN + BRAND_HEADER_HEIGHT / 2 - 11, 'TEAMUP', { size: 22, bold: true, color: COLORS.white })
    }

    const textX = logoLeft + logoBlockWidth + 20
    const textWidth = CONTENT_WIDTH - (textX - MARGIN) - 16
    // With a venue the band carries three lines instead of two, so the block is
    // shifted up to keep it centred inside the same header height.
    const hasVenue = this.ctx.venue != null && this.ctx.venue !== ''

    p.text(textX, MARGIN + (hasVenue ? 10 : 15), this.ctx.tournamentName, {
      size: 17,
      bold: true,
      color: COLORS.white,
      maxWidth: textWidth
    })

    if (hasVenue) {
      p.text(textX, MARGIN + 30, `Sede: ${this.ctx.venue}`, {
        size: 11,
        bold: true,
        color: COLORS.amberSoft,
        maxWidth: textWidth
      })
    }

    p.text(textX, MARGIN + (hasVenue ? 44 : 37), this.ctx.subtitle, {
      size: 8.5,
      color: COLORS.amberSoft,
      maxWidth: textWidth
    })
  }

  private drawDayHeading(heading: string, continued: boolean): void {
    const p = this.painter
    const label = continued ? `${heading.toUpperCase()}  ·  CONTINUACIÓN` : heading.toUpperCase()

    p.rect(MARGIN, this.cursorTop, CONTENT_WIDTH, DAY_HEADING_HEIGHT, { fill: COLORS.amber, radius: 5 })
    p.text(MARGIN + 12, this.cursorTop + DAY_HEADING_HEIGHT / 2 - 6, label, {
      size: 12,
      bold: true,
      color: COLORS.ink,
      maxWidth: CONTENT_WIDTH - 24
    })
    this.cursorTop += DAY_HEADING_HEIGHT + 6
  }

  private drawColumnHeader(): void {
    const p = this.painter
    const top = this.cursorTop

    p.rect(MARGIN, top, TIME_COL_WIDTH, COLUMN_HEADER_HEIGHT, {
      fill: COLORS.tealDeep,
      stroke: COLORS.tealDeep,
      lineWidth: 0.5
    })
    p.text(MARGIN + TIME_COL_WIDTH / 2, top + COLUMN_HEADER_HEIGHT / 2 - 5, 'HORA', {
      size: 8.5,
      bold: true,
      color: COLORS.white,
      align: 'center'
    })

    this.ctx.courtLabels.forEach((label, index) => {
      const x = MARGIN + TIME_COL_WIDTH + index * this.ctx.courtColWidth

      p.rect(x, top, this.ctx.courtColWidth, COLUMN_HEADER_HEIGHT, {
        fill: COLORS.teal,
        stroke: COLORS.tealDeep,
        lineWidth: 0.5
      })
      p.text(x + this.ctx.courtColWidth / 2, top + COLUMN_HEADER_HEIGHT / 2 - 5.5, label, {
        size: 10,
        bold: true,
        color: COLORS.white,
        align: 'center',
        maxWidth: this.ctx.courtColWidth - 8
      })
    })

    this.cursorTop += COLUMN_HEADER_HEIGHT
  }

  private rowHeightFor(slot: PlannerPdfSlot, innerWidth: number): number {
    return Math.max(
      MIN_ROW_HEIGHT,
      slot.cells.reduce(
        (max, matches) =>
          Math.max(max, matches[0] ? this.ctx.stripHeight + layoutCell(matches[0], innerWidth).bodyHeight : 0),
        0
      )
    )
  }

  /**
   * Paints the time column. A slot states a real start time unless some match
   * that day is scheduled to end exactly when it begins (start + duration ==
   * this slot's start) — only then can a court still be occupied, so only then
   * is the time announced as a "no earlier than" instead of a fixed hour. A
   * gap left on purpose (courts free well before this slot) is a real,
   * promised time and is shown as-is.
   */
  private drawTimeCell(time: string, top: number, rowHeight: number, approximate: boolean): void {
    const p = this.painter
    const centerX = MARGIN + TIME_COL_WIDTH / 2

    p.rect(MARGIN, top, TIME_COL_WIDTH, rowHeight, { fill: COLORS.tealDark, stroke: COLORS.tealDeep, lineWidth: 0.5 })

    if (!approximate) {
      p.text(centerX, top + rowHeight / 2 - 7, time, { size: 12, bold: true, color: COLORS.white, align: 'center' })

      return
    }

    // Two lines: the qualifier above, the hour below, centred as one block.
    const blockTop = top + rowHeight / 2 - 11

    p.text(centerX, blockTop, TIME_APPROX_LABEL, {
      size: TIME_APPROX_SIZE,
      color: COLORS.amberSoft,
      align: 'center',
      maxWidth: TIME_COL_WIDTH - 4
    })
    p.text(centerX, blockTop + TIME_APPROX_LINE, time, {
      size: 12,
      bold: true,
      color: COLORS.white,
      align: 'center'
    })
  }

  private drawRow(
    slot: PlannerPdfSlot,
    rowIndex: number,
    rowHeight: number,
    innerWidth: number,
    approximate: boolean
  ): void {
    const p = this.painter
    const top = this.cursorTop

    this.drawTimeCell(slot.time, top, rowHeight, approximate)

    slot.cells.forEach((matches, index) => {
      const x = MARGIN + TIME_COL_WIDTH + index * this.ctx.courtColWidth
      const match = matches[0]
      const bg = rowIndex % 2 === 0 ? COLORS.cellBg : COLORS.rowAlt

      if (!match) {
        p.rect(x, top, this.ctx.courtColWidth, rowHeight, {
          fill: COLORS.emptyBg,
          stroke: COLORS.border,
          lineWidth: 0.5
        })
        p.text(x + this.ctx.courtColWidth / 2, top + rowHeight / 2 - 6, '—', {
          size: 11,
          color: COLORS.border,
          align: 'center'
        })

        return
      }

      const layout = layoutCell(match, innerWidth)
      const stripHeight = this.ctx.stripHeight

      p.rect(x, top, this.ctx.courtColWidth, rowHeight, { fill: bg, stroke: COLORS.border, lineWidth: 0.5 })
      // Category / round strip. Every cell of the document gets the same height,
      // so its content is centred inside rather than pinned to the top.
      p.rect(x, top, this.ctx.courtColWidth, stripHeight, { fill: COLORS.tealDark })

      const centerX = x + this.ctx.courtColWidth / 2
      let lineTop = top + stripHeight / 2 - layout.stripInkCenter

      layout.categoryLines.forEach((line) => {
        p.text(centerX, lineTop, line, { size: HEADER_CAT_SIZE, bold: true, color: COLORS.white, align: 'center' })
        lineTop += HEADER_LINE
      })

      // Round label and the amber "CONSUELO" chip share a line, centred as one
      // group — the chip on its own row is what used to make consolation
      // headers taller than the rest.
      if (layout.roundLine !== '' || layout.consolation) {
        const roundWidth = layout.roundLine === '' ? 0 : measureText(layout.roundLine, HEADER_ROUND_SIZE, false)
        const chipWidth = layout.consolation ? consolationChipWidth() : 0
        const gap = layout.roundLine !== '' && layout.consolation ? CHIP_GAP : 0
        let cursorX = centerX - (roundWidth + gap + chipWidth) / 2
        const chipTop = lineTop + CHIP_TOP_OFFSET

        if (layout.roundLine !== '') {
          // Beside the chip it is aligned to the chip's middle rather than to
          // its own line box, so the two read as one line.
          p.text(
            cursorX,
            layout.consolation ? centerTextIn(chipTop, CONSOLATION_CHIP_HEIGHT, HEADER_ROUND_SIZE) : lineTop,
            layout.roundLine,
            { size: HEADER_ROUND_SIZE, color: COLORS.amberSoft }
          )
          cursorX += roundWidth + gap
        }

        if (layout.consolation) {
          p.rect(cursorX, chipTop, chipWidth, CONSOLATION_CHIP_HEIGHT, { fill: COLORS.amber, radius: 2 })
          p.text(
            cursorX + chipWidth / 2,
            centerTextIn(chipTop, CONSOLATION_CHIP_HEIGHT, CONSOLATION_CHIP_SIZE),
            CONSOLATION_CHIP_LABEL,
            { size: CONSOLATION_CHIP_SIZE, bold: true, color: COLORS.white, align: 'center' }
          )
        }

        lineTop += metaLineHeight(layout.roundLine, layout.consolation)
      }

      // Player block, centred in whatever space is left under the strip. The row
      // is as tall as its tallest cell, so a match whose names fit on one line
      // shares a row with one that wrapped onto two — without centring it would
      // hang from the top of its cell while the neighbour filled the height.
      let bodyTop = top + stripHeight + (rowHeight - stripHeight) / 2 - layout.bodyInkCenter

      layout.homeLines.forEach((line) => {
        p.text(centerX, bodyTop, line, { size: PLAYER_SIZE, bold: true, color: COLORS.ink, align: 'center' })
        bodyTop += PLAYER_LINE
      })
      p.text(centerX, bodyTop + 1, 'vs', { size: VS_SIZE, color: COLORS.muted, align: 'center' })
      bodyTop += VS_SIZE + 4
      layout.awayLines.forEach((line) => {
        p.text(centerX, bodyTop, line, { size: PLAYER_SIZE, bold: true, color: COLORS.ink, align: 'center' })
        bodyTop += PLAYER_LINE
      })
    })

    this.cursorTop += rowHeight
  }

  addDay(day: PlannerPdfDay): void {
    const innerWidth = this.ctx.courtColWidth - CELL_PAD * 2

    // Keep the day heading, the column header and at least one row together.
    if (this.cursorTop + DAY_HEADING_HEIGHT + 6 + COLUMN_HEADER_HEIGHT + MIN_ROW_HEIGHT > this.bottomLimit) {
      this.newPage()
    }

    this.drawDayHeading(day.heading, false)
    this.drawColumnHeader()

    if (day.slots.length === 0) {
      this.painter.text(MARGIN + 12, this.cursorTop + 8, 'Sin partidos planificados.', { size: 9, color: COLORS.muted })
      this.cursorTop += 28

      return
    }

    // "No antes de" only makes sense when some match that day is scheduled to
    // end exactly as a slot begins — i.e. that slot's start minus the match
    // duration is itself a start time in use. A slot reached after a genuine
    // gap (every court free well before it) states a real, fixed time.
    const startMinutes = slotStartMinutes(day)

    day.slots.forEach((slot, index) => {
      const rowHeight = this.rowHeightFor(slot, innerWidth)

      if (this.cursorTop + rowHeight > this.bottomLimit) {
        this.newPage()
        this.drawDayHeading(day.heading, true)
        this.drawColumnHeader()
      }

      const approximate = index > 0 && startMinutes.has(timeToMinutes(slot.time) - this.ctx.matchDurationMinutes)

      this.drawRow(slot, index, rowHeight, innerWidth, approximate)
    })

    this.cursorTop += 16
  }

  private drawFooters(): void {
    const total = this.pages.length

    this.pages.forEach((page, index) => {
      page.text(PAGE_WIDTH / 2, PAGE_HEIGHT - MARGIN - 4, `TeamUp · Planificador  —  Página ${index + 1} de ${total}`, {
        size: 7.5,
        color: COLORS.muted,
        align: 'center'
      })
    })
  }

  finish(): Painter[] {
    this.drawFooters()

    return this.pages
  }
}

/**
 * Default assumed for callers that don't say how long a match runs. Kept in
 * sync with the planner's own default (`DEFAULT_DURATION` in utils/planner.ts)
 * only by convention — the two aren't imported from each other to keep this
 * module's only dependency the generic PDF machinery.
 */
const DEFAULT_MATCH_DURATION_MINUTES = 90

/** Pure builder: produces the PDF bytes. Exported so it can be exercised in tests. */
export function buildPlannerPdf(
  tournamentName: string,
  venue: string | null,
  courtLabels: string[],
  days: PlannerPdfDay[],
  logo: PdfLogo | null = null,
  matchDurationMinutes: number = DEFAULT_MATCH_DURATION_MINUTES
): Uint8Array {
  const columnCount = Math.max(1, courtLabels.length)
  const courtColWidth = (CONTENT_WIDTH - TIME_COL_WIDTH) / columnCount
  const ctx: BuildContext = {
    tournamentName,
    venue,
    subtitle: `Planificación de partidos · Generado el ${new Date().toLocaleDateString('es-AR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })}`,
    courtLabels: courtLabels.length > 0 ? courtLabels : ['Cancha 1'],
    logo,
    courtColWidth,
    // Measured once over every match so the header bands are uniform across the
    // whole document, not just within a row.
    stripHeight: measureStripHeight(days, courtColWidth - CELL_PAD * 2),
    matchDurationMinutes
  }
  const doc = new PlannerDocument(ctx)

  if (days.length === 0) {
    doc.addDay({ heading: 'Sin fechas planificadas', slots: [] })
  } else {
    days.forEach((day) => doc.addDay(day))
  }

  return assemblePdf(doc.finish(), A4_LANDSCAPE, logo)
}

/**
 * Builds the planner PDF (loading the org-resolved brand logo) and triggers a
 * browser download. `logoSrc` should come from `resolveOrganizationImage`.
 * `matchDurationMinutes` should be the same duration the grid scheduled every
 * match with, so "No antes de" reflects which slots actually chain courts
 * back-to-back.
 */
export async function downloadPlannerPdf(
  tournamentName: string,
  venue: string | null,
  courtLabels: string[],
  days: PlannerPdfDay[],
  logoSrc?: string,
  matchDurationMinutes: number = DEFAULT_MATCH_DURATION_MINUTES
): Promise<void> {
  const logo = logoSrc ? await loadBrowserLogo(logoSrc, BRAND_HEADER_HEX) : null

  downloadPdfBytes(
    buildPlannerPdf(tournamentName, venue, courtLabels, days, logo, matchDurationMinutes),
    `planificacion-${slugify(tournamentName, 'torneo')}.pdf`
  )
}
