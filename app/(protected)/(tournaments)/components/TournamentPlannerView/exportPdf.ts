// Dependency-free PDF generator for the tournament planner export.
//
// The project intentionally ships no PDF library, so this builds a valid
// PDF 1.4 file by hand. Unlike the previous monospaced-text version, this one
// draws a branded, colour-coded grid (courts as columns, time slots as rows)
// that mirrors the "orden de juego" sheets clubs are used to. It supports
// filled/rounded rectangles, proportional Helvetica text (with real width
// metrics for centring and wrapping) and an embedded raster logo (resolved per
// organization by the caller).

/* --------------------------------------------------------------------------
 * Page geometry & brand palette
 * ------------------------------------------------------------------------ */

const PAGE_WIDTH = 841.89 // A4 landscape, in points
const PAGE_HEIGHT = 595.28
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
 * Qualifier drawn above every start time except a day's first one. A planner
 * cannot promise a start time for a court that is still being used, so those
 * rows announce the earliest a match can begin rather than a fixed hour.
 */
const TIME_APPROX_LABEL = 'No antes de'
const TIME_APPROX_SIZE = 7
const TIME_APPROX_LINE = 9

type Rgb = [number, number, number]

const hex = (value: string): Rgb => {
  const n = parseInt(value.replace('#', ''), 16)

  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255]
}

/** Header band colour — logos are composited over this so white "bar" logos blend in. */
const BRAND_HEADER_HEX = '#0f766e'
const COLORS = {
  teal: hex(BRAND_HEADER_HEX),
  tealDark: hex('#115e59'),
  tealDeep: hex('#0b4f4a'),
  amber: hex('#f59e0b'),
  amberSoft: hex('#fde68a'),
  ink: hex('#1f2937'),
  muted: hex('#6b7280'),
  white: [1, 1, 1] as Rgb,
  rowAlt: hex('#f0faf8'),
  cellBg: hex('#ffffff'),
  emptyBg: hex('#f8fafc'),
  border: hex('#cbd5e1')
}
/* --------------------------------------------------------------------------
 * Helvetica width metrics (units per 1000em) — enough for centring & wrapping
 * ------------------------------------------------------------------------ */
// prettier-ignore
const HELVETICA: Record<string, number> = {
  ' ': 278, '!': 278, '"': 355, '#': 556, $: 556, '%': 889, '&': 667, "'": 191, '(': 333, ')': 333,
  '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278, '0': 556, '1': 556, '2': 556, '3': 556,
  '4': 556, '5': 556, '6': 556, '7': 556, '8': 556, '9': 556, ':': 278, ';': 278, '<': 584, '=': 584,
  '>': 584, '?': 556, '@': 1015, A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722,
  I: 278, J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611,
  U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611, '[': 278, '\\': 278, ']': 278, '^': 469, _: 556,
  '`': 333, a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500,
  l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722,
  x: 500, y: 500, z: 500, '{': 334, '|': 260, '}': 334, '~': 584, '·': 278, '—': 1000, '–': 556, '…': 1000
}
// prettier-ignore
const HELVETICA_BOLD: Record<string, number> = {
  ' ': 278, '!': 333, '"': 474, '#': 556, $: 556, '%': 889, '&': 722, "'": 238, '(': 333, ')': 333,
  '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278, '0': 556, '1': 556, '2': 556, '3': 556,
  '4': 556, '5': 556, '6': 556, '7': 556, '8': 556, '9': 556, ':': 333, ';': 333, '<': 584, '=': 584,
  '>': 584, '?': 611, '@': 975, A: 722, B: 722, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722,
  I: 278, J: 556, K: 722, L: 611, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611,
  U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611, '[': 333, '\\': 278, ']': 333, '^': 584, _: 556,
  '`': 333, a: 556, b: 611, c: 556, d: 611, e: 556, f: 333, g: 611, h: 611, i: 278, j: 278, k: 556,
  l: 278, m: 889, n: 611, o: 611, p: 611, q: 611, r: 389, s: 556, t: 333, u: 611, v: 556, w: 778,
  x: 556, y: 556, z: 500, '{': 389, '|': 280, '}': 389, '~': 584, '·': 278, '—': 1000, '–': 556, '…': 1000
}
const COMBINING_DIACRITICS_REGEX = new RegExp('[\\u0300-\\u036f]', 'g')

function charWidth(char: string, bold: boolean): number {
  const table = bold ? HELVETICA_BOLD : HELVETICA

  if (char in table) {
    return table[char]
  }

  // Accented Latin letters share the advance width of their base letter in the
  // standard Helvetica metrics, so fold diacritics before looking up.
  const base = char.normalize('NFD').replace(COMBINING_DIACRITICS_REGEX, '')

  if (base && base[0] in table) {
    return table[base[0]]
  }

  return bold ? 611 : 556
}

/** Text width in points for a given font size. */
function measureText(text: string, size: number, bold: boolean): number {
  let units = 0

  for (const char of text) {
    units += charWidth(char, bold)
  }

  return (units * size) / 1000
}

function truncateToWidth(text: string, size: number, bold: boolean, maxWidth: number): string {
  if (measureText(text, size, bold) <= maxWidth) {
    return text
  }

  let result = ''

  for (const char of text) {
    if (measureText(`${result}${char}…`, size, bold) > maxWidth) {
      break
    }

    result += char
  }

  return `${result}…`
}

/** Greedy word-wrap with hard-break for over-long tokens and an ellipsis on overflow. */
function wrapText(text: string, size: number, bold: boolean, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''

  const pushWord = (word: string) => {
    if (current === '') {
      // A single word wider than the column has to be broken character by character.
      if (measureText(word, size, bold) > maxWidth) {
        let piece = ''

        for (const char of word) {
          if (piece !== '' && measureText(piece + char, size, bold) > maxWidth) {
            lines.push(piece)
            piece = char
          } else {
            piece += char
          }
        }

        current = piece

        return
      }

      current = word

      return
    }

    if (measureText(`${current} ${word}`, size, bold) <= maxWidth) {
      current = `${current} ${word}`
    } else {
      lines.push(current)
      current = ''
      pushWord(word)
    }
  }

  words.forEach(pushWord)

  if (current !== '') {
    lines.push(current)
  }

  if (lines.length <= maxLines) {
    return lines
  }

  const kept = lines.slice(0, maxLines)

  kept[maxLines - 1] = truncateToWidth(`${lines[maxLines - 1]} …`, size, bold, maxWidth)

  return kept
}

/* --------------------------------------------------------------------------
 * WinAnsi text encoding (matches the /WinAnsiEncoding declared on the fonts)
 * ------------------------------------------------------------------------ */

const WIN_ANSI_SPECIALS: Record<number, number> = {
  0x20ac: 0x80,
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f
}

function toWinAnsiBytes(text: string): number[] {
  const bytes: number[] = []

  for (const char of text) {
    const code = char.codePointAt(0) ?? 0x3f
    const byte = code <= 0xff ? code : WIN_ANSI_SPECIALS[code]

    bytes.push(byte ?? 0x3f)
  }

  return bytes
}

function encodePdfString(text: string): number[] {
  const escaped = text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')

  return toWinAnsiBytes(escaped)
}

function asciiBytes(text: string): number[] {
  const bytes: number[] = []

  for (let i = 0; i < text.length; i++) {
    bytes.push(text.charCodeAt(i) & 0xff)
  }

  return bytes
}

class ByteWriter {
  private bytes: number[] = []

  get length(): number {
    return this.bytes.length
  }

  pushAscii(text: string): void {
    this.bytes.push(...asciiBytes(text))
  }

  pushBytes(values: number[]): void {
    this.bytes.push(...values)
  }

  toUint8Array(): Uint8Array {
    return Uint8Array.from(this.bytes)
  }
}

/* --------------------------------------------------------------------------
 * Page painter — a thin drawing API over a PDF content stream
 * ------------------------------------------------------------------------ */

const fmt = (value: number): string => {
  const rounded = Math.round(value * 100) / 100

  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2)
}

const rgb = (color: Rgb): string => `${fmt(color[0])} ${fmt(color[1])} ${fmt(color[2])}`

interface TextOptions {
  size: number
  bold?: boolean
  color?: Rgb
  align?: 'left' | 'center' | 'right'
  maxWidth?: number
}

interface RectOptions {
  fill?: Rgb
  stroke?: Rgb
  lineWidth?: number
  radius?: number
}

class Painter {
  readonly writer = new ByteWriter()

  private y(top: number): number {
    return PAGE_HEIGHT - top
  }

  /** Draws a rectangle whose top-left corner is (x, top). Supports rounded corners. */
  rect(x: number, top: number, width: number, height: number, options: RectOptions): void {
    if (!options.fill && !options.stroke) {
      return
    }

    const bottom = this.y(top + height)

    if (options.fill) {
      this.writer.pushAscii(`${rgb(options.fill)} rg\n`)
    }

    if (options.stroke) {
      this.writer.pushAscii(`${rgb(options.stroke)} RG\n${fmt(options.lineWidth ?? 1)} w\n`)
    }

    const radius = Math.min(options.radius ?? 0, width / 2, height / 2)

    if (radius > 0) {
      const k = 0.5523 * radius
      const right = x + width
      const topY = bottom + height

      this.writer.pushAscii(`${fmt(x + radius)} ${fmt(topY)} m\n`)
      this.writer.pushAscii(`${fmt(right - radius)} ${fmt(topY)} l\n`)
      this.writer.pushAscii(
        `${fmt(right - radius + k)} ${fmt(topY)} ${fmt(right)} ${fmt(topY - radius + k)} ${fmt(right)} ${fmt(topY - radius)} c\n`
      )
      this.writer.pushAscii(`${fmt(right)} ${fmt(bottom + radius)} l\n`)
      this.writer.pushAscii(
        `${fmt(right)} ${fmt(bottom + radius - k)} ${fmt(right - radius + k)} ${fmt(bottom)} ${fmt(right - radius)} ${fmt(bottom)} c\n`
      )
      this.writer.pushAscii(`${fmt(x + radius)} ${fmt(bottom)} l\n`)
      this.writer.pushAscii(
        `${fmt(x + radius - k)} ${fmt(bottom)} ${fmt(x)} ${fmt(bottom + radius - k)} ${fmt(x)} ${fmt(bottom + radius)} c\n`
      )
      this.writer.pushAscii(`${fmt(x)} ${fmt(topY - radius)} l\n`)
      this.writer.pushAscii(
        `${fmt(x)} ${fmt(topY - radius + k)} ${fmt(x + radius - k)} ${fmt(topY)} ${fmt(x + radius)} ${fmt(topY)} c\n`
      )
    } else {
      this.writer.pushAscii(`${fmt(x)} ${fmt(bottom)} ${fmt(width)} ${fmt(height)} re\n`)
    }

    if (options.fill && options.stroke) {
      this.writer.pushAscii('B\n')
    } else if (options.fill) {
      this.writer.pushAscii('f\n')
    } else {
      this.writer.pushAscii('S\n')
    }
  }

  /** Draws a single already-wrapped line of text. `top` is the top of the line box. */
  text(x: number, top: number, value: string, options: TextOptions): void {
    if (value === '') {
      return
    }

    const bold = options.bold ?? false
    const color = options.color ?? COLORS.ink
    let drawn = value
    let drawX = x

    if (options.maxWidth != null) {
      drawn = truncateToWidth(drawn, options.size, bold, options.maxWidth)
    }

    if (options.align === 'center' || options.align === 'right') {
      const width = measureText(drawn, options.size, bold)

      drawX = options.align === 'center' ? x - width / 2 : x - width
    }

    const baseline = this.y(top + options.size * BASELINE_RATIO)

    this.writer.pushAscii(`BT\n${rgb(color)} rg\n/${bold ? 'F2' : 'F1'} ${fmt(options.size)} Tf\n`)
    this.writer.pushAscii(`1 0 0 1 ${fmt(drawX)} ${fmt(baseline)} Tm\n(`)
    this.writer.pushBytes(encodePdfString(drawn))
    this.writer.pushAscii(') Tj\nET\n')
  }

  image(x: number, top: number, width: number, height: number): void {
    const bottom = this.y(top + height)

    this.writer.pushAscii(`q\n${fmt(width)} 0 0 ${fmt(height)} ${fmt(x)} ${fmt(bottom)} cm\n/Im0 Do\nQ\n`)
  }
}

/* --------------------------------------------------------------------------
 * Logo raster (embedded as an uncompressed DeviceRGB image XObject)
 * ------------------------------------------------------------------------ */

export interface PlannerPdfLogo {
  width: number
  height: number
  /** Row-major RGB bytes (no alpha), already composited over the header colour. */
  rgb: Uint8Array
}

/**
 * Rasterises a logo URL to RGB bytes over the teal header colour, in the browser.
 * Compositing over the header colour (rather than white) lets a white "bar" logo
 * on a transparent background sit seamlessly on the PDF's teal band. The URL
 * should already be resolved per organization (e.g. via
 * `resolveOrganizationImage(orgDomain, 'logo-bar.png')`). Returns null if the logo
 * can't be loaded, so the PDF simply falls back to a text badge.
 */
async function loadBrowserLogo(logoSrc: string): Promise<PlannerPdfLogo | null> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return null
  }

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()

      element.crossOrigin = 'anonymous'
      element.onload = () => resolve(element)
      element.onerror = reject
      element.src = logoSrc
    })
    const natural = Math.max(image.naturalWidth, image.naturalHeight) || 1
    const scale = Math.min(1, 320 / natural)
    const width = Math.max(1, Math.round(image.naturalWidth * scale))
    const height = Math.max(1, Math.round(image.naturalHeight * scale))
    const canvas = document.createElement('canvas')

    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d')

    if (!ctx) {
      return null
    }

    ctx.fillStyle = BRAND_HEADER_HEX
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(image, 0, 0, width, height)

    const { data } = ctx.getImageData(0, 0, width, height)
    const rgbBytes = new Uint8Array(width * height * 3)

    for (let i = 0, o = 0; i < data.length; i += 4, o += 3) {
      rgbBytes[o] = data[i]
      rgbBytes[o + 1] = data[i + 1]
      rgbBytes[o + 2] = data[i + 2]
    }

    return { width, height, rgb: rgbBytes }
  } catch {
    return null
  }
}

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
/** Where a line's baseline sits below the top of its line box, per unit of font size. */
const BASELINE_RATIO = 0.8
/** Helvetica cap height, per unit of font size. */
const CAP_HEIGHT_RATIO = 0.718
/**
 * Vertical extent of the ink a line of text actually puts on the page, measured
 * from the top of its line box. Centring a block on its line boxes leaves it
 * looking high: a box is taller than the capitals it holds, and the slack sits
 * below the baseline where it has no counterpart above the first line. These two
 * bound the capitals instead, which is what the eye centres on. Descenders are
 * deliberately ignored — otherwise a cell would shift depending on whether a
 * competitor's name happens to contain a "g".
 */
const capTop = (size: number): number => size * (BASELINE_RATIO - CAP_HEIGHT_RATIO)
const capBottom = (size: number): number => size * BASELINE_RATIO
/** The `top` that centres a line of capitals inside the box [boxTop, boxTop + boxHeight]. */
const centerTextIn = (boxTop: number, boxHeight: number, size: number): number =>
  boxTop + boxHeight / 2 - (capTop(size) + capBottom(size)) / 2
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

/* --------------------------------------------------------------------------
 * Document assembly
 * ------------------------------------------------------------------------ */

interface BuildContext {
  tournamentName: string
  /** Venue the whole planning belongs to; shown on every page's header band. */
  venue: string | null
  subtitle: string
  courtLabels: string[]
  logo: PlannerPdfLogo | null
  courtColWidth: number
  /** Uniform header-strip height for every match cell (see measureStripHeight). */
  stripHeight: number
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
    this.painter = new Painter()
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
   * Paints the time column. Only the day's first slot states a real start time:
   * everything after it depends on how long the previous matches actually took,
   * so it is announced as a "no earlier than" — which is what an order of play
   * can honestly promise, and what avoids players showing up to a court that is
   * still busy.
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

  private drawRow(slot: PlannerPdfSlot, rowIndex: number, rowHeight: number, innerWidth: number): void {
    const p = this.painter
    const top = this.cursorTop

    this.drawTimeCell(slot.time, top, rowHeight, rowIndex > 0)

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

    day.slots.forEach((slot, index) => {
      const rowHeight = this.rowHeightFor(slot, innerWidth)

      if (this.cursorTop + rowHeight > this.bottomLimit) {
        this.newPage()
        this.drawDayHeading(day.heading, true)
        this.drawColumnHeader()
      }

      this.drawRow(slot, index, rowHeight, innerWidth)
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

/* --------------------------------------------------------------------------
 * Low-level PDF file assembly
 * ------------------------------------------------------------------------ */

function assemblePdf(pages: Painter[], logo: PlannerPdfLogo | null): Uint8Array {
  const catalogId = 1
  const pagesId = 2
  const fontRegularId = 3
  const fontBoldId = 4
  const logoId = logo ? 5 : 0
  const firstDynamicId = logo ? 6 : 5
  const pageIds = pages.map((_, index) => firstDynamicId + index * 2)
  const contentIds = pages.map((_, index) => firstDynamicId + index * 2 + 1)
  const objects: { id: number; bytes: number[] }[] = []
  const pushText = (id: number, text: string) => objects.push({ id, bytes: asciiBytes(text) })

  pushText(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`)
  pushText(pagesId, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`)
  pushText(fontRegularId, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
  pushText(fontBoldId, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')

  if (logo) {
    objects.push({
      id: logoId,
      bytes: [
        ...asciiBytes(
          `<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} ` +
            `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Length ${logo.rgb.length} >>\nstream\n`
        ),
        ...Array.from(logo.rgb),
        ...asciiBytes('\nendstream')
      ]
    })
  }

  const xobjectEntry = logo ? ` /XObject << /Im0 ${logoId} 0 R >>` : ''

  pages.forEach((page, index) => {
    const contentBytes = Array.from(page.writer.toUint8Array())

    pushText(
      pageIds[index],
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
        `/Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >>${xobjectEntry} >> ` +
        `/Contents ${contentIds[index]} 0 R >>`
    )

    objects.push({
      id: contentIds[index],
      bytes: [
        ...asciiBytes(`<< /Length ${contentBytes.length} >>\nstream\n`),
        ...contentBytes,
        ...asciiBytes('\nendstream')
      ]
    })
  })

  objects.sort((a, b) => a.id - b.id)

  const writer = new ByteWriter()
  const offsets: number[] = []

  writer.pushAscii('%PDF-1.4\n')

  for (const object of objects) {
    offsets[object.id] = writer.length
    writer.pushAscii(`${object.id} 0 obj\n`)
    writer.pushBytes(object.bytes)
    writer.pushAscii('\nendobj\n')
  }

  const xrefOffset = writer.length
  const totalObjects = objects.length + 1

  writer.pushAscii(`xref\n0 ${totalObjects}\n0000000000 65535 f \n`)

  for (let id = 1; id < totalObjects; id++) {
    writer.pushAscii(`${String(offsets[id] ?? 0).padStart(10, '0')} 00000 n \n`)
  }

  writer.pushAscii(`trailer\n<< /Size ${totalObjects} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`)

  return writer.toUint8Array()
}

const COMBINING_DIACRITICS_SLUG = new RegExp('[\\u0300-\\u036f]', 'g')

function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS_SLUG, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '')

  return slug || 'torneo'
}

/** Pure builder: produces the PDF bytes. Exported so it can be exercised in tests. */
export function buildPlannerPdf(
  tournamentName: string,
  venue: string | null,
  courtLabels: string[],
  days: PlannerPdfDay[],
  logo: PlannerPdfLogo | null = null
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
    stripHeight: measureStripHeight(days, courtColWidth - CELL_PAD * 2)
  }
  const doc = new PlannerDocument(ctx)

  if (days.length === 0) {
    doc.addDay({ heading: 'Sin fechas planificadas', slots: [] })
  } else {
    days.forEach((day) => doc.addDay(day))
  }

  return assemblePdf(doc.finish(), logo)
}

/**
 * Builds the planner PDF (loading the org-resolved brand logo) and triggers a
 * browser download. `logoSrc` should come from `resolveOrganizationImage`.
 */
export async function downloadPlannerPdf(
  tournamentName: string,
  venue: string | null,
  courtLabels: string[],
  days: PlannerPdfDay[],
  logoSrc?: string
): Promise<void> {
  const logo = logoSrc ? await loadBrowserLogo(logoSrc) : null
  const pdfBytes = buildPlannerPdf(tournamentName, venue, courtLabels, days, logo)
  const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = url
  anchor.download = `planificacion-${slugify(tournamentName)}.pdf`
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}
