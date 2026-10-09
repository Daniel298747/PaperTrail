// Fictional statements for the demo household, ported from the backend's FictionalDocuments: small but valid
// PDF files (hand-written PDF objects, standard Helvetica) and canvas-drawn "photos" of paper receipts.

import { formatLongDate } from './dates'
import type { ReceiptSpec, StatementLine, StatementSpec } from './store'
import { displayMoney } from './util'

const DISCLAIMER = 'Fictional statement generated for the PaperTrail demo. Not a real bill.'

/** Splits a total into plausible lines that add up exactly. */
export function statementLines(totalCents: number, ...labels: string[]): StatementLine[] {
  const weights = [71, 17, 12]
  let remaining = totalCents
  return labels.map((label, i) => {
    const cents = i === labels.length - 1 ? remaining
      : Math.floor((totalCents * weights[Math.min(i, weights.length - 1)] + 50) / 100)
    remaining -= cents
    return { label, cents }
  })
}

const money = (cents: number) => displayMoney(cents, 'EUR')

const num = (value: number) => String(Math.round(value * 100) / 100)

const escape = (value: string) => value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')

/** Approximate Helvetica advance widths: precise for digits and punctuation used in amounts. */
function helveticaWidth(value: string, size: number, bold: boolean): number {
  let units = 0
  for (const ch of value) {
    if (/[0-9€$]/.test(ch)) units += 556
    else if (ch === '.' || ch === ',' || ch === ' ') units += 278
    else if (ch === '-') units += 333
    else if (ch !== ch.toLowerCase()) units += bold ? 722 : 667
    else units += bold ? 611 : 556
  }
  return (units * size) / 1000
}

/** WinAnsiEncoding: ASCII and Latin-1 map to themselves, the euro sign is 0x80. */
function winAnsi(text: string): Uint8Array {
  return Uint8Array.from(text, (ch) => {
    const code = ch.charCodeAt(0)
    if (ch === '€') return 0x80
    return code < 256 ? code : 0x3f
  })
}

const ascii = (text: string) => new TextEncoder().encode(text)

export function statementPdf(s: StatementSpec): Uint8Array {
  const c: string[] = []
  const text = (font: string, size: number, x: number, y: number, value: string) =>
    c.push(`0.09 0.09 0.09 rg BT /${font} ${size} Tf ${num(x)} ${num(y)} Td (${escape(value)}) Tj ET\n`)
  const textRight = (font: string, size: number, right: number, y: number, value: string) =>
    text(font, size, right - helveticaWidth(value, size, font === 'F2'), y, value)
  const rule = (y: number) => c.push(`0.847 0.831 0.796 RG 0.75 w 56 ${y} m 539 ${y} l S\n`)

  // Accent bar and header
  c.push('0.141 0.357 0.271 rg 56 790 96 5 re f\n')
  text('F2', 22, 56, 756, s.provider)
  text('F1', 10, 56, 738, s.documentTitle)
  textRight('F1', 10, 539, 756, `Account ${s.accountReference}`)
  textRight('F1', 10, 539, 738, `Issued ${formatLongDate(s.issued)}`)
  rule(708)
  text('F1', 9, 56, 686, 'PREPARED FOR')
  text('F2', 11, 56, 671, s.householdName)
  text('F1', 9, 300, 686, 'BILLING PERIOD')
  text('F2', 11, 300, 671, `${formatLongDate(s.periodStart)} - ${formatLongDate(s.periodEnd)}`)
  // Amount due block
  c.push('0.961 0.953 0.933 rg 56 586 483 60 re f\n')
  text('F1', 9, 70, 626, 'AMOUNT DUE')
  text('F2', 24, 70, 600, money(s.totalCents))
  text('F1', 9, 330, 626, 'PAY BY')
  text('F2', 16, 330, 603, formatLongDate(s.dueDate))
  text('F1', 9, 56, 556, 'CHARGES')
  let y = 536
  for (const line of s.lines) {
    text('F1', 11, 56, y, line.label)
    textRight('F1', 11, 539, y, money(line.cents))
    y -= 8
    rule(y)
    y -= 16
  }
  text('F2', 11, 56, y, 'Total')
  textRight('F2', 11, 539, y, money(s.totalCents))
  if (s.note !== null) {
    y -= 40
    c.push(`0.141 0.357 0.271 rg 56 ${y - 4} 3 18 re f\n`)
    text('F1', 10, 66, y, s.note)
  }
  rule(92)
  text('F1', 8, 56, 76, DISCLAIMER)
  text('F1', 8, 56, 64, `${s.provider} is an invented company. Amounts and references are illustrative.`)
  return assemble(winAnsi(c.join('')))
}

function assemble(content: Uint8Array): Uint8Array {
  const objects: Uint8Array[] = [
    ascii('<< /Type /Catalog /Pages 2 0 R >>'),
    ascii('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    ascii('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] '
      + '/Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>'),
    ascii('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),
    ascii('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'),
    concat(ascii(`<< /Length ${content.length} >>\nstream\n`), content, ascii('\nendstream')),
  ]
  const parts: Uint8Array[] = [ascii('%PDF-1.4\n'), Uint8Array.of(0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a)]
  let size = parts.reduce((total, part) => total + part.length, 0)
  const offsets: number[] = []
  objects.forEach((object, i) => {
    offsets.push(size)
    for (const part of [ascii(`${i + 1} 0 obj\n`), object, ascii('\nendobj\n')]) {
      parts.push(part)
      size += part.length
    }
  })
  let table = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) table += `${String(offset).padStart(10, '0')} 00000 n \n`
  table += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${size}\n%%EOF\n`
  parts.push(ascii(table))
  return concat(...parts)
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

/** A receipt "photographed" on a table: shows image statements in the archive. */
export async function receiptImage(r: ReceiptSpec): Promise<Uint8Array> {
  const canvas = document.createElement('canvas')
  canvas.width = 900
  canvas.height = 1200
  const g = canvas.getContext('2d')
  if (!g) throw new Error('Canvas is unavailable')
  g.fillStyle = '#5B554B'
  g.fillRect(0, 0, 900, 1200)
  g.fillStyle = '#F8F6F1'
  g.fillRect(150, 90, 600, 1020)
  g.fillStyle = '#245B45'
  g.fillRect(190, 140, 120, 10)
  g.strokeStyle = '#D8D4CB'
  g.lineWidth = 2
  for (let y = 420; y <= 820; y += 80) {
    g.beginPath()
    g.moveTo(190, y)
    g.lineTo(710, y)
    g.stroke()
  }
  g.fillStyle = '#171717'
  g.font = 'bold 40px Georgia, serif'
  g.fillText(r.provider, 190, 230)
  g.font = '24px Arial, sans-serif'
  g.fillText(`Receipt  ${formatLongDate(r.date)}`, 190, 290)
  g.fillText(r.description, 190, 400)
  g.font = 'bold 30px Arial, sans-serif'
  g.fillText(`Paid  ${money(r.amountCents)}`, 190, 900)
  g.font = '16px Arial, sans-serif'
  g.fillText('Fictional receipt - PaperTrail demo', 190, 1060)
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, r.format === 'jpg' ? 'image/jpeg' : 'image/png', 0.88))
  if (!blob) throw new Error('The receipt image could not be encoded')
  return new Uint8Array(await blob.arrayBuffer())
}

/** Accepted statement formats, identified by their leading bytes (DocumentType.detect). */
export function detectType(bytes: Uint8Array): { mimeType: string; extension: string } | null {
  if (bytes.length < 4) return null
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (png.every((b, i) => bytes[i] === b)) return { mimeType: 'image/png', extension: 'png' }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mimeType: 'image/jpeg', extension: 'jpg' }
  const magic = [0x25, 0x50, 0x44, 0x46, 0x2d] // %PDF-
  const searchWindow = Math.min(bytes.length - magic.length, 1024)
  for (let offset = 0; offset <= searchWindow; offset++) {
    if (magic.every((b, i) => bytes[offset + i] === b)) return { mimeType: 'application/pdf', extension: 'pdf' }
  }
  return null
}

/** Keeps only the final path segment, strips control characters and bounds the length. */
export function cleanFilename(original: string, extension: string): string {
  let name = original.replace(/\\/g, '/')
  // eslint-disable-next-line no-control-regex
  name = name.slice(name.lastIndexOf('/') + 1).replace(/[\u0000-\u001f\u007f]/g, '').trim()
  if (name === '' || name === '.' || name === '..') name = `statement.${extension}`
  if (name.length > 200) {
    const dot = name.lastIndexOf('.')
    const ext = dot > 0 && name.length - dot <= 10 ? name.slice(dot) : ''
    name = name.slice(0, 200 - ext.length) + ext
  }
  return name
}
