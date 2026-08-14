// Dependency-free PDF writer.
//
// The project intentionally ships no PDF library, so documents are built by
// hand as valid PDF 1.4 files. This module holds everything that is true of
// any such document — page painting, Helvetica text metrics, WinAnsi encoding,
// image embedding and file assembly — so each export only has to describe its
// own layout (see the planner exports under (tournaments)/components).
//
// Nothing here knows about tournaments: the only domain-ish helpers are the
// browser logo rasteriser and the download trigger, which every export needs
// in the same shape.

/* --------------------------------------------------------------------------
 * Colours
 * ------------------------------------------------------------------------ */

/** A colour as PDF device RGB, each component in the 0..1 range. */
export type Rgb = [number, number, number]

/** Converts a '#rrggbb' string into the 0..1 triple the PDF operators expect. */
export const hex = (value: string): Rgb => {
  const n = parseInt(value.replace('#', ''), 16)

  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255]
}

export const BLACK: Rgb = [0, 0, 0]

/**
 * Colour of the header band every document opens with. Logos are composited
 * over it before being embedded, so a white "bar" logo on a transparent
 * background blends into the band instead of sitting on a white box.
 */
export const BRAND_HEADER_HEX = '#0f766e'

/**
 * The palette every generated document draws with, so a planner sheet and an
 * interclubes order of play look like the same product. It mirrors the app's
 * own teal/amber theme.
 */
export const DOC_COLORS = {
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
export function measureText(text: string, size: number, bold: boolean): number {
  let units = 0

  for (const char of text) {
    units += charWidth(char, bold)
  }

  return (units * size) / 1000
}

export function truncateToWidth(text: string, size: number, bold: boolean, maxWidth: number): string {
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
export function wrapText(text: string, size: number, bold: boolean, maxWidth: number, maxLines: number): string[] {
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
 * Vertical text metrics
 * ------------------------------------------------------------------------ */

/** Where a line's baseline sits below the top of its line box, per unit of font size. */
export const BASELINE_RATIO = 0.8
/** Helvetica cap height, per unit of font size. */
export const CAP_HEIGHT_RATIO = 0.718
/**
 * Vertical extent of the ink a line of text actually puts on the page, measured
 * from the top of its line box. Centring a block on its line boxes leaves it
 * looking high: a box is taller than the capitals it holds, and the slack sits
 * below the baseline where it has no counterpart above the first line. These two
 * bound the capitals instead, which is what the eye centres on. Descenders are
 * deliberately ignored — otherwise a cell would shift depending on whether a
 * competitor's name happens to contain a "g".
 */
export const capTop = (size: number): number => size * (BASELINE_RATIO - CAP_HEIGHT_RATIO)
export const capBottom = (size: number): number => size * BASELINE_RATIO
/** The `top` that centres a line of capitals inside the box [boxTop, boxTop + boxHeight]. */
export const centerTextIn = (boxTop: number, boxHeight: number, size: number): number =>
  boxTop + boxHeight / 2 - (capTop(size) + capBottom(size)) / 2

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

export class ByteWriter {
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

export interface TextOptions {
  size: number
  bold?: boolean
  color?: Rgb
  align?: 'left' | 'center' | 'right'
  maxWidth?: number
}

export interface RectOptions {
  fill?: Rgb
  stroke?: Rgb
  lineWidth?: number
  radius?: number
}

/**
 * Draws on a single page, in a top-left origin coordinate system (PDF's own
 * origin is bottom-left, which is unusable for laying a document out downwards).
 * Every page of a document must share the same height, which is what makes the
 * flip possible.
 */
export class Painter {
  readonly writer = new ByteWriter()

  constructor(private readonly pageHeight: number) {}

  private y(top: number): number {
    return this.pageHeight - top
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
    const color = options.color ?? BLACK
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

  /** Draws the document's embedded image (see PdfLogo) inside the given box. */
  image(x: number, top: number, width: number, height: number): void {
    const bottom = this.y(top + height)

    this.writer.pushAscii(`q\n${fmt(width)} 0 0 ${fmt(height)} ${fmt(x)} ${fmt(bottom)} cm\n/Im0 Do\nQ\n`)
  }
}

/* --------------------------------------------------------------------------
 * Logo raster (embedded as an uncompressed DeviceRGB image XObject)
 * ------------------------------------------------------------------------ */

export interface PdfLogo {
  width: number
  height: number
  /** Row-major RGB bytes (no alpha), already composited over the header colour. */
  rgb: Uint8Array
}

/**
 * Rasterises a logo URL to RGB bytes over `backgroundHex`, in the browser.
 * Compositing over the band colour (rather than white) lets a white "bar" logo
 * on a transparent background sit seamlessly on a coloured header. The URL
 * should already be resolved per organization (e.g. via
 * `resolveOrganizationImage(orgDomain, 'logo-bar.png')`). Returns null if the
 * logo can't be loaded, so the document simply falls back to a text badge.
 */
export async function loadBrowserLogo(logoSrc: string, backgroundHex: string): Promise<PdfLogo | null> {
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

    ctx.fillStyle = backgroundHex
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
 * Low-level PDF file assembly
 * ------------------------------------------------------------------------ */

/** Page size in points. A4 portrait is 595.28 × 841.89; landscape swaps them. */
export interface PageSize {
  width: number
  height: number
}

export const A4_PORTRAIT: PageSize = { width: 595.28, height: 841.89 }
export const A4_LANDSCAPE: PageSize = { width: 841.89, height: 595.28 }

/**
 * Writes the painted pages out as a PDF file: two Helvetica fonts, the optional
 * logo image and one content stream per page, all uncompressed (which keeps the
 * file readable in tests and costs little for documents this small).
 */
export function assemblePdf(pages: Painter[], size: PageSize, logo: PdfLogo | null): Uint8Array {
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
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${size.width} ${size.height}] ` +
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

/* --------------------------------------------------------------------------
 * Browser download
 * ------------------------------------------------------------------------ */

const COMBINING_DIACRITICS_SLUG = new RegExp('[\\u0300-\\u036f]', 'g')

/** Filename-safe version of a title, e.g. "Torneo Apertura" → "torneo-apertura". */
export function slugify(text: string, fallback = 'documento'): string {
  const slug = text
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS_SLUG, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '')

  return slug || fallback
}

/** Triggers a browser download of the given PDF bytes. */
export function downloadPdfBytes(bytes: Uint8Array, fileName: string): void {
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}
