// Minimal, dependency-free PDF generator used to export the tournament
// planning grid. The project has no PDF library installed, so this builds a
// valid multi-page PDF 1.4 file by hand (monospaced text only, using the
// standard Courier base font) instead of pulling in an external dependency.

const PAGE_WIDTH = 841.89 // A4 landscape, in points
const PAGE_HEIGHT = 595.28
const MARGIN_X = 36
const MARGIN_TOP = 40
const MARGIN_BOTTOM = 40
const FONT_SIZE = 9
const LINE_HEIGHT = 12
/** How many text lines fit on one page. Content flows continuously across this limit
 * instead of starting a new page for every day — a page break only happens when the
 * page actually runs out of room. */
const LINES_PER_PAGE = Math.max(6, Math.floor((PAGE_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM) / LINE_HEIGHT))
/** Table columns, sized in monospaced characters (Courier). */
const COLS = [
  { label: 'HORA', width: 5 },
  { label: 'CANCHA', width: 14 },
  { label: 'CATEGORÍA', width: 18 },
  { label: 'RONDA', width: 16 },
  { label: 'PARTIDO', width: 76 }
]

function formatRow(cells: string[]): string {
  return COLS.map((col, index) => {
    const raw = (cells[index] ?? '').toString()
    const truncated = raw.length > col.width ? `${raw.slice(0, Math.max(0, col.width - 1))}…` : raw

    return truncated.padEnd(col.width, ' ')
  }).join(' ')
}

// WinAnsiEncoding (~= CP1252) matches Unicode for code points 0x00-0xFF, except for this
// block, which holds typographic characters (dashes, smart quotes, ellipsis, etc.) at
// different code points than their Unicode counterparts. Without this map, characters
// like "—" or "…" — both common in generated headings — would render as "?".
const WIN_ANSI_SPECIALS: Record<number, number> = {
  0x20ac: 0x80, // €
  0x201a: 0x82, // ‚
  0x0192: 0x83, // ƒ
  0x201e: 0x84, // „
  0x2026: 0x85, // …
  0x2020: 0x86, // †
  0x2021: 0x87, // ‡
  0x02c6: 0x88, // ˆ
  0x2030: 0x89, // ‰
  0x0160: 0x8a, // Š
  0x2039: 0x8b, // ‹
  0x0152: 0x8c, // Œ
  0x017d: 0x8e, // Ž
  0x2018: 0x91, // '
  0x2019: 0x92, // '
  0x201c: 0x93, // "
  0x201d: 0x94, // "
  0x2022: 0x95, // •
  0x2013: 0x96, // – (en dash)
  0x2014: 0x97, // — (em dash)
  0x02dc: 0x98, // ˜
  0x2122: 0x99, // ™
  0x0161: 0x9a, // š
  0x203a: 0x9b, // ›
  0x0153: 0x9c, // œ
  0x017e: 0x9e, // ž
  0x0178: 0x9f // Ÿ
}

/** Encodes a JS string to WinAnsi byte values, matching the encoding declared on the PDF fonts. */
function toWinAnsiBytes(text: string): number[] {
  const bytes: number[] = []

  for (const char of text) {
    const code = char.codePointAt(0) ?? 0x3f
    const byte = code <= 0xff ? code : WIN_ANSI_SPECIALS[code]

    bytes.push(byte ?? 0x3f) // fall back to '?' for unsupported characters
  }

  return bytes
}

/** Escapes literal-string special characters and encodes to bytes for a PDF `(...)Tj` operator. */
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

interface PdfLine {
  text: string
  bold?: boolean
  size?: number
}

interface PdfPageSpec {
  lines: (PdfLine | null)[]
}

function buildContentStreamBytes(page: PdfPageSpec): number[] {
  const writer = new ByteWriter()
  let y = PAGE_HEIGHT - MARGIN_TOP

  writer.pushAscii('BT\n')

  for (const line of page.lines) {
    if (line && line.text !== '') {
      const font = line.bold ? '/F2' : '/F1'
      const size = line.size ?? FONT_SIZE

      writer.pushAscii(`${font} ${size} Tf\n`)
      writer.pushAscii(`1 0 0 1 ${MARGIN_X} ${y.toFixed(2)} Tm\n`)
      writer.pushAscii('(')
      writer.pushBytes(encodePdfString(line.text))
      writer.pushAscii(') Tj\n')
    }

    y -= LINE_HEIGHT
  }

  writer.pushAscii('ET')

  return Array.from(writer.toUint8Array())
}

function assemblePdf(pages: PdfPageSpec[]): Uint8Array {
  const catalogId = 1
  const pagesId = 2
  const fontRegularId = 3
  const fontBoldId = 4
  const firstDynamicId = 5
  const pageIds = pages.map((_, index) => firstDynamicId + index * 2)
  const contentIds = pages.map((_, index) => firstDynamicId + index * 2 + 1)
  const objects: { id: number; bytes: number[] }[] = []
  const push = (id: number, text: string) => objects.push({ id, bytes: asciiBytes(text) })

  push(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`)
  push(pagesId, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`)
  push(fontRegularId, '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>')
  push(fontBoldId, '<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>')

  pages.forEach((page, index) => {
    const pageId = pageIds[index]
    const contentId = contentIds[index]
    const contentBytes = buildContentStreamBytes(page)

    push(
      pageId,
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
        `/Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${contentId} 0 R >>`
    )

    objects.push({
      id: contentId,
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

  writer.pushAscii(`xref\n0 ${totalObjects}\n`)
  writer.pushAscii('0000000000 65535 f \n')

  for (let id = 1; id < totalObjects; id++) {
    writer.pushAscii(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`)
  }

  writer.pushAscii(`trailer\n<< /Size ${totalObjects} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`)

  return writer.toUint8Array()
}

export interface PlannerPdfDay {
  /** Human-readable day heading, e.g. "jueves 9 de julio". */
  heading: string
  /** Table rows, already formatted as [hora, cancha, categoría, ronda, partido]. */
  rows: string[][]
}

const COMBINING_DIACRITICS_REGEX = new RegExp('[\\u0300-\\u036f]', 'g')

function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS_REGEX, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '')

  return slug || 'torneo'
}

/** Builds the planner PDF and triggers a browser download. Runs entirely client-side. */
export function downloadPlannerPdf(tournamentName: string, plannerDays: PlannerPdfDay[]): void {
  const title = `Planificación — ${tournamentName}`
  const generatedAt = `Generado el ${new Date().toLocaleString('es-AR')}`
  const headerRow = formatRow(COLS.map((col) => col.label))
  const separatorLine = '-'.repeat(headerRow.length)
  // Days flow one after another on the same page (no forced page break per day) —
  // a new page only starts once the current one actually runs out of room.
  const pages: PdfPageSpec[] = []
  let currentLines: (PdfLine | null)[] = []
  const remainingOnPage = () => LINES_PER_PAGE - currentLines.length

  const startNewPage = () => {
    if (currentLines.length > 0) {
      pages.push({ lines: currentLines })
    }

    currentLines = []
  }

  const pushLine = (line: PdfLine | null) => {
    if (remainingOnPage() <= 0) {
      startNewPage()
    }

    currentLines.push(line)
  }

  // Pushes a group of lines that must stay together, breaking to a fresh page first if
  // it (plus `reserveAfter` extra lines, e.g. at least one table row) wouldn't fit —
  // this is what stops a day's heading from ending up alone at the bottom of a page.
  const pushBlock = (lines: (PdfLine | null)[], reserveAfter = 0) => {
    if (remainingOnPage() < lines.length + reserveAfter) {
      startNewPage()
    }

    lines.forEach((line) => currentLines.push(line))
  }

  pushBlock([{ text: title, bold: true, size: 13 }, { text: generatedAt, size: 8 }, null])

  if (plannerDays.length === 0) {
    pushLine({ text: 'No hay partidos planificados.' })
  }

  plannerDays.forEach((day, dayIndex) => {
    // Extra breathing room between one day's table and the next. Skipped right after a
    // page break (currentLines is empty then) so a fresh page never starts with blank
    // lines floating above the day heading.
    if (dayIndex > 0 && currentLines.length > 0) {
      pushLine(null)
      pushLine(null)
    }

    pushBlock(
      [{ text: day.heading, bold: true, size: 11 }, null, { text: headerRow, bold: true }, { text: separatorLine }],
      day.rows.length > 0 ? 1 : 0
    )

    if (day.rows.length === 0) {
      pushLine({ text: 'Sin partidos planificados.' })

      return
    }

    day.rows.forEach((row) => {
      if (remainingOnPage() <= 0) {
        startNewPage()
        // Repeat the column header at the top of the continuation page.
        pushBlock([{ text: headerRow, bold: true }, { text: separatorLine }])
      }

      pushLine({ text: formatRow(row) })
    })
  })

  startNewPage()

  const pdfBytes = assemblePdf(pages)
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
