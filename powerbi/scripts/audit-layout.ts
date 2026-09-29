// Writes powerbi/preview/audit-report.md: a measured audit of every page in
// powerbi/layout/manifest.json.
//
// Part 1, geometry: each page's blocks against the 1920x1080 canvas, page
// padding 48 and gap 20. Overlaps, gaps between vertically adjacent blocks,
// gaps to the page edges, slack above the footer, block fill of the usable
// area, blocks squeezed or stretched against their spec's meta.json size, and
// edges that nearly but not quite line up.
//
// Part 2, text and density: each Deneb block's audit SVG at its manifest size
// (from `validate.ts --manifest-sizes`) is parsed for its text and marks.
// Ellipsised strings, text past the block, text under 10px, the share of the
// block's height that carries text, and the largest empty region (a 40px grid
// scan of mark bounding boxes). Node sizes text with an estimate, so pass the
// render-blocks.ts output directory to fold in the browser's own ellipsis,
// outside and overlap report, which is the truth.
//
// Parts 3 and 4 are judgement, written by hand below the MANUAL marker in the
// report; a rerun rewrites Parts 1 and 2 and keeps everything after the marker.
//
//   npx tsx powerbi/scripts/validate.ts --manifest-sizes
//   npx tsx powerbi/scripts/render-blocks.ts <rendersDir>
//   npm run deneb:audit -- [--renders <rendersDir>]
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const POWERBI = fileURLToPath(new URL('../', import.meta.url))
const MANIFEST = `${POWERBI}layout/manifest.json`
const SPECS = `${POWERBI}deneb/specs/`
const AUDIT = `${POWERBI}preview/audit/`
const REPORT = `${POWERBI}preview/audit-report.md`
const MANUAL = '<!-- MANUAL: Parts 3 and 4 are written by hand below this line; npm run deneb:audit keeps them. -->'

const CANVAS = { width: 1920, height: 1080 }
const PAD = 48
const GAP = 20
const HEADER_GAP = 8
const EDGE_TOLERANCE = 12
const HEADER_TEXT_COLUMN = 1284
const CELL = 40
const EMPTY = { width: 200, height: 120 }

interface Block {
  id: string
  kind: string
  visual?: string
  x: number
  y: number
  width: number
  height: number
  params?: Record<string, string | number>
}
interface Page {
  id: string
  displayName: string
  blocks: Block[]
}
interface Manifest {
  reports: { id: string; name: string; pages: Page[] }[]
}
interface Meta {
  width?: number
  height?: number
}
type Severity = 'high' | 'medium' | 'low'
interface Finding {
  severity: Severity
  page: string
  block: string
  fault: string
  fix: string
  /** Pixels or area affected, for ranking within a severity. */
  weight: number
}

const findings: Finding[] = []
const add = (f: Finding) => findings.push(f)
const rank: Record<Severity, number> = { high: 0, medium: 1, low: 2 }
const pct = (n: number) => `${(n * 100).toFixed(0)}%`
const short = (page: Page, id: string) => id.replace(`${page.id}.`, '')

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest
const metaCache = new Map<string, Meta>()
function meta(visual: string): Meta {
  if (!metaCache.has(visual)) {
    const path = `${SPECS}${visual}.meta.json`
    metaCache.set(visual, existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Meta) : {})
  }
  return metaCache.get(visual) as Meta
}

const isFooter = (b: Block) => b.id.endsWith('.footer')
const isHeaderRow = (b: Block) => b.id.endsWith('.header') || b.id.endsWith('legend')
const right = (b: Block) => b.x + b.width
const bottom = (b: Block) => b.y + b.height
const xOverlap = (a: Block, b: Block) => Math.min(right(a), right(b)) - Math.max(a.x, b.x)
const yOverlap = (a: Block, b: Block) => Math.min(bottom(a), bottom(b)) - Math.max(a.y, b.y)

// ---------------------------------------------------------------- Part 1

interface PageGeometry {
  page: Page
  rows: string[]
  overlaps: string[]
  gaps: string[]
  edges: string
  slack: number
  fill: number
}

function geometry(page: Page): PageGeometry {
  const blocks = page.blocks
  // The overview key sits inset in the domain grid's sixteenth cell, so it is left out of the gap, edge and fill checks.
  const content = blocks.filter((b) => !isFooter(b) && !b.id.endsWith('.key'))
  const footer = blocks.find(isFooter)
  const name = page.id
  const rows: string[] = []
  for (const b of blocks) {
    const m = b.visual ? meta(b.visual) : {}
    const wr = m.width ? b.width / m.width : 1
    const hr = m.height ? b.height / m.height : 1
    const notes: string[] = []
    if (m.height && b.height < m.height) notes.push(`squeezed h ${pct(hr)}`)
    if (m.width && b.width < 0.6 * m.width) notes.push(`squeezed w ${pct(wr)}`)
    if (wr > 1.6) notes.push(`stretched w ${pct(wr)}`)
    if (hr > 1.6) notes.push(`stretched h ${pct(hr)}`)
    rows.push(`| ${short(page, b.id)} | ${b.visual ?? b.kind} | ${b.x} | ${b.y} | ${b.width} | ${b.height} | ${m.width ?? '-'}x${m.height ?? '-'} | ${notes.join(', ') || 'ok'} |`)
    if (m.height && b.height < m.height) {
      add({
        severity: hr < 0.8 ? 'medium' : 'low',
        page: name,
        block: short(page, b.id),
        fault: `squeezed: height ${b.height} is ${pct(hr)} of meta ${m.height}`,
        fix: `give it ${m.height}px or lower the spec's meta height if the smaller size reads well`,
        weight: (m.height - b.height) * b.width,
      })
    }
    if (m.width && b.width < 0.6 * m.width) {
      add({
        severity: wr < 0.8 ? 'medium' : 'low',
        page: name,
        block: short(page, b.id),
        fault: `squeezed: width ${b.width} is ${pct(wr)} of meta ${m.width}`,
        fix: 'widen the block or design the spec for this width',
        weight: (m.width - b.width) * b.height,
      })
    }
    if (wr > 1.6 || hr > 1.6) {
      add({
        severity: 'low',
        page: name,
        block: short(page, b.id),
        fault: `stretched: ${b.width}x${b.height} against meta ${m.width}x${m.height}`,
        fix: 'check the spec fills the extra room rather than spreading thin',
        weight: 0,
      })
    }
    if (b.x < 0 || b.y < 0 || right(b) > CANVAS.width || bottom(b) > CANVAS.height) {
      add({ severity: 'high', page: name, block: short(page, b.id), fault: 'off page', fix: 'bring it inside 1920x1080', weight: b.width * b.height })
    }
  }

  const overlaps: string[] = []
  for (let i = 0; i < blocks.length; i++)
    for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i]
      const b = blocks[j]
      const ox = xOverlap(a, b)
      const oy = yOverlap(a, b)
      const framed = a.id.endsWith('.domains') && b.id.endsWith('.key') && ox === b.width && oy === b.height
      const header = a.id.endsWith('.header') ? a : b.id.endsWith('.header') ? b : undefined
      const legend = a.id.endsWith('legend') ? a : b.id.endsWith('legend') ? b : undefined
      const legendUnderLogo = !!header && !!legend && legend !== header && legend.x >= header.x + HEADER_TEXT_COLUMN && right(legend) <= right(header) && legend.y >= header.y && bottom(legend) <= bottom(header)
      if (ox > 0 && oy > 0 && legendUnderLogo) {
        overlaps.push(`${short(page, a.id)} / ${short(page, b.id)}: accepted: legend under logo`)
      } else if (ox > 0 && oy > 0 && !framed) {
        overlaps.push(`${short(page, a.id)} / ${short(page, b.id)}: ${ox}x${oy} = ${ox * oy}px²`)
        add({ severity: 'high', page: name, block: `${short(page, a.id)} / ${short(page, b.id)}`, fault: `overlap ${ox}x${oy}`, fix: 'separate the blocks by the 20px gap', weight: ox * oy })
      }
    }

  // Vertically adjacent: b starts below a, their columns overlap and nothing sits between them.
  const gaps: string[] = []
  for (const a of content)
    for (const b of content) {
      if (a === b || b.y < bottom(a) || xOverlap(a, b) <= 0) continue
      const between = content.some((c) => c !== a && c !== b && xOverlap(c, a) > 0 && xOverlap(c, b) > 0 && c.y >= bottom(a) && bottom(c) <= b.y)
      if (between) continue
      const gap = b.y - bottom(a)
      const allowed = isHeaderRow(a) || isHeaderRow(b) ? [GAP, HEADER_GAP] : [GAP]
      const ok = allowed.includes(gap)
      gaps.push(`${short(page, a.id)} -> ${short(page, b.id)}: ${gap}${ok ? '' : ' (flag)'}`)
      if (!ok)
        add({
          severity: gap > 60 ? 'medium' : 'low',
          page: name,
          block: `${short(page, a.id)} -> ${short(page, b.id)}`,
          fault: `vertical gap ${gap}px, expected ${allowed.join(' or ')}`,
          fix: gap > GAP ? `close the ${gap - GAP}px of dead space or fill it` : 'restore the 20px gap',
          weight: Math.abs(gap - GAP) * xOverlap(a, b),
        })
    }
  // Horizontal neighbours in the same band.
  for (const a of content)
    for (const b of content) {
      if (a === b || b.x < right(a) || yOverlap(a, b) <= 0) continue
      if (content.some((c) => c !== a && c !== b && yOverlap(c, a) > 0 && yOverlap(c, b) > 0 && c.x >= right(a) && right(c) <= b.x)) continue
      const gap = b.x - right(a)
      if (gap !== GAP) {
        gaps.push(`${short(page, a.id)} -> ${short(page, b.id)} (across): ${gap} (flag)`)
        add({ severity: 'low', page: name, block: `${short(page, a.id)} -> ${short(page, b.id)}`, fault: `horizontal gap ${gap}px, expected 20`, fix: 'restore the 20px gap', weight: 0 })
      }
    }

  const edge = {
    left: Math.min(...blocks.map((b) => b.x)),
    top: Math.min(...blocks.map((b) => b.y)),
    right: CANVAS.width - Math.max(...blocks.map(right)),
    bottom: CANVAS.height - Math.max(...blocks.map(bottom)),
  }
  for (const [side, value] of Object.entries(edge))
    if (value !== PAD)
      add({
        severity: value < 0 ? 'high' : 'low',
        page: name,
        block: side === 'bottom' && footer ? 'footer' : 'page',
        fault: `${side} edge gap ${value}px, expected ${PAD}`,
        fix: side === 'bottom' ? 'accept as the footer band, or align the footer to the 48px margin' : `move to ${PAD}px`,
        weight: 0,
      })

  const lowest = Math.max(...content.map(bottom))
  const slack = footer ? footer.y - lowest : CANVAS.height - PAD - lowest
  if (slack < 0 || slack > 24)
    add({
      severity: slack < 0 ? 'high' : slack > 60 ? 'medium' : 'low',
      page: name,
      block: 'footer',
      fault: slack < 0 ? `content runs ${-slack}px into the footer` : `${slack}px slack above the footer`,
      fix: slack < 0 ? 'shorten the lowest row' : 'grow the lowest row into the slack',
      weight: Math.abs(slack) * 1824,
    })

  // Fill: union of content blocks, rasterised at 4px, over the usable area above the footer.
  const usableBottom = (footer ? footer.y - GAP : CANVAS.height - PAD) + GAP
  const usable = (CANVAS.width - 2 * PAD) * (usableBottom - PAD)
  const covered = new Set<number>()
  for (const b of content)
    for (let y = b.y; y < bottom(b); y += 4) for (let x = b.x; x < right(b); x += 4) covered.add((y >> 2) * 1000 + (x >> 2))
  const fill = (covered.size * 16) / usable
  if (fill < 0.82)
    add({ severity: 'low', page: name, block: 'page', fault: `blocks fill ${pct(fill)} of the usable area`, fix: 'grow blocks into the empty space', weight: (0.82 - fill) * usable })

  // Near-miss edges: left or right edges 1 to 12px apart.
  const seen = new Set<string>()
  for (const a of content)
    for (const b of content) {
      if (a === b) continue
      for (const [ea, na] of [[a.x, 'left'], [right(a), 'right']] as const)
        for (const [eb, nb] of [[b.x, 'left'], [right(b), 'right']] as const) {
          const d = Math.abs(ea - eb)
          const key = [a.id, na, b.id, nb].sort().join('|')
          if (d >= 1 && d <= EDGE_TOLERANCE && !seen.has(key)) {
            seen.add(key)
            add({
              severity: 'medium',
              page: name,
              block: `${short(page, a.id)} / ${short(page, b.id)}`,
              fault: `misaligned: ${na} edge ${ea} vs ${nb} edge ${eb} (${d}px)`,
              fix: 'snap both edges to one column line',
              weight: d * 100,
            })
          }
        }
    }

  return {
    page,
    rows,
    overlaps,
    gaps,
    edges: `left ${edge.left}, top ${edge.top}, right ${edge.right}, bottom ${edge.bottom}`,
    slack,
    fill,
  }
}

// ---------------------------------------------------------------- Part 2

interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}
interface Text extends Box {
  s: string
  size: number
}

/** Bounding box of an SVG path's d attribute, control points included. */
function pathBox(d: string): Box | null {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? []
  let cx = 0
  let cy = 0
  let sx = 0
  let sy = 0
  let cmd = ''
  const xs: number[] = []
  const ys: number[] = []
  let i = 0
  const num = () => Number(tokens[i++])
  const put = (x: number, y: number) => {
    xs.push(x)
    ys.push(y)
  }
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++]
    const rel = cmd === cmd.toLowerCase()
    const ox = rel ? cx : 0
    const oy = rel ? cy : 0
    switch (cmd.toUpperCase()) {
      case 'M':
      case 'L':
      case 'T':
        cx = ox + num()
        cy = oy + num()
        if (cmd.toUpperCase() === 'M') {
          sx = cx
          sy = cy
          cmd = rel ? 'l' : 'L'
        }
        put(cx, cy)
        break
      case 'H':
        cx = ox + num()
        put(cx, cy)
        break
      case 'V':
        cy = oy + num()
        put(cx, cy)
        break
      case 'C':
        for (let k = 0; k < 3; k++) {
          const x = ox + num()
          const y = oy + num()
          put(x, y)
          if (k === 2) {
            cx = x
            cy = y
          }
        }
        break
      case 'S':
      case 'Q':
        for (let k = 0; k < 2; k++) {
          const x = ox + num()
          const y = oy + num()
          put(x, y)
          if (k === 1) {
            cx = x
            cy = y
          }
        }
        break
      case 'A': {
        const rx = num()
        const ry = num()
        i += 3
        const x = ox + num()
        const y = oy + num()
        put(cx - rx, cy - ry)
        put(x + rx, y + ry)
        cx = x
        cy = y
        break
      }
      case 'Z':
        cx = sx
        cy = sy
        break
      default:
        i++
    }
  }
  if (!xs.length) return null
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
}

const attr = (a: string, name: string) => new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(a)?.[1]
function translate(a: string): [number, number, number] {
  const t = attr(a, 'transform') ?? ''
  const m = /translate\(([-\d.e]+)[ ,]*([-\d.e]*)\)/.exec(t)
  const r = /rotate\(([-\d.e]+)/.exec(t)
  return [m ? Number(m[1]) : 0, m && m[2] ? Number(m[2]) : 0, r ? Number(r[1]) : 0]
}

/** Every text and mark box in a Vega SVG, in SVG pixels. */
function parseSvg(svg: string): { texts: Text[]; marks: Box[]; width: number; height: number } {
  const width = Number(/<svg[^>]*\swidth="([\d.]+)"/.exec(svg)?.[1] ?? 0)
  const height = Number(/<svg[^>]*\sheight="([\d.]+)"/.exec(svg)?.[1] ?? 0)
  const stack: [number, number][] = [[0, 0]]
  const texts: Text[] = []
  const marks: Box[] = []
  const tag = /<(\/?)([a-zA-Z]+)([^>]*?)(\/?)>/g
  let m: RegExpExecArray | null
  while ((m = tag.exec(svg))) {
    const [, close, name, a, self] = m
    const [ox, oy] = stack[stack.length - 1]
    if (name === 'g') {
      if (close) stack.pop()
      else {
        const [tx, ty] = translate(a)
        stack.push([ox + tx, oy + ty])
      }
      continue
    }
    if (close || /display="none"|class="(background|foreground)"/.test(a) || attr(a, 'opacity') === '0') continue
    const [tx, ty, rot] = translate(a)
    const x = ox + tx
    const y = oy + ty
    if (name === 'text' && !self) {
      const end = svg.indexOf('</text>', tag.lastIndex)
      const inner = svg.slice(tag.lastIndex, end)
      tag.lastIndex = end + 7
      const lines = (inner.match(/<tspan[^>]*>([^<]*)<\/tspan>/g) ?? [inner]).map((l) =>
        l.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"'),
      )
      const s = lines.join(' ').trim()
      if (!s) continue
      const size = Number((attr(a, 'font-size') ?? '11').replace('px', ''))
      const mono = /mono|consolas/i.test(attr(a, 'font-family') ?? '')
      const w = Math.max(...lines.map((l) => l.length)) * size * (mono ? 0.6 : 0.52)
      const h = size * 1.2 * lines.length
      const anchor = attr(a, 'text-anchor') ?? 'start'
      const along = anchor === 'middle' ? -w / 2 : anchor === 'end' ? -w : 0
      const box =
        Math.abs(rot) === 90
          ? { x0: x - size, y0: y + (rot < 0 ? -w - along : along), x1: x + 0.25 * size, y1: y + (rot < 0 ? -along : w + along) }
          : { x0: x + along, y0: y - 0.8 * size, x1: x + along + w, y1: y - 0.8 * size + h }
      texts.push({ s, size, ...box })
      marks.push(box)
    } else if (name === 'path' || name === 'line' || name === 'rect' || name === 'circle') {
      let box: Box | null = null
      if (name === 'path') box = pathBox(attr(a, 'd') ?? '')
      else if (name === 'line') box = { x0: 0, y0: 0, x1: Number(attr(a, 'x2') ?? 0), y1: Number(attr(a, 'y2') ?? 0) }
      else if (name === 'rect') {
        const rx = Number(attr(a, 'x') ?? 0)
        const ry = Number(attr(a, 'y') ?? 0)
        box = { x0: rx, y0: ry, x1: rx + Number(attr(a, 'width') ?? 0), y1: ry + Number(attr(a, 'height') ?? 0) }
      } else {
        const r = Number(attr(a, 'r') ?? 0)
        box = { x0: -r, y0: -r, x1: r, y1: r }
      }
      if (!box) continue
      const fill = attr(a, 'fill')
      const stroke = attr(a, 'stroke')
      if ((fill === undefined || fill === 'none' || fill === 'transparent') && (stroke === undefined || stroke === 'none' || stroke === 'transparent')) continue
      marks.push({ x0: x + Math.min(box.x0, box.x1), y0: y + Math.min(box.y0, box.y1), x1: x + Math.max(box.x0, box.x1), y1: y + Math.max(box.y0, box.y1) })
    }
  }
  return { texts, marks, width, height }
}

/** Largest rectangle of empty 40px cells at least 200x120, and the share of the block such regions cover. */
function emptyRegions(marks: Box[], width: number, height: number): { largest: string; share: number; area: number } {
  // Cards and backgrounds cover the block; they are containers, not content.
  const content = marks.filter((b) => (b.x1 - b.x0) * (b.y1 - b.y0) < 0.35 * width * height)
  const cols = Math.ceil(width / CELL)
  const rows = Math.ceil(height / CELL)
  const full: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0))
  for (const b of content)
    for (let r = Math.max(0, Math.floor(b.y0 / CELL)); r < Math.min(rows, Math.ceil(b.y1 / CELL)); r++)
      for (let c = Math.max(0, Math.floor(b.x0 / CELL)); c < Math.min(cols, Math.ceil(b.x1 / CELL)); c++) full[r][c] = 1
  const sum: number[][] = Array.from({ length: rows + 1 }, () => new Array<number>(cols + 1).fill(0))
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) sum[r + 1][c + 1] = full[r][c] + sum[r][c + 1] + sum[r + 1][c] - sum[r][c]
  const filled = (r0: number, c0: number, r1: number, c1: number) => sum[r1][c1] - sum[r0][c1] - sum[r1][c0] + sum[r0][c0]
  const minC = Math.ceil(EMPTY.width / CELL)
  const minR = Math.ceil(EMPTY.height / CELL)
  let best = { area: 0, r0: 0, c0: 0, r1: 0, c1: 0 }
  const inRegion: boolean[][] = Array.from({ length: rows }, () => new Array<boolean>(cols).fill(false))
  for (let r0 = 0; r0 < rows; r0++)
    for (let c0 = 0; c0 < cols; c0++) {
      if (full[r0][c0]) continue
      for (let r1 = r0 + minR; r1 <= rows; r1++) {
        if (filled(r0, c0, r1, c0 + 1)) break
        for (let c1 = c0 + minC; c1 <= cols; c1++) {
          if (filled(r0, c0, r1, c1)) break
          const area = (r1 - r0) * (c1 - c0)
          if (area > best.area) best = { area, r0, c0, r1, c1 }
          if (r1 - r0 === minR && c1 - c0 === minC) for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) inRegion[r][c] = true
        }
      }
    }
  const share = inRegion.flat().filter(Boolean).length / (rows * cols)
  if (!best.area) return { largest: '-', share: 0, area: 0 }
  const w = Math.min(width, best.c1 * CELL) - best.c0 * CELL
  const h = Math.min(height, best.r1 * CELL) - best.r0 * CELL
  return { largest: `${w}x${h} at ${best.c0 * CELL},${best.r0 * CELL}`, share, area: w * h }
}

interface AuditJson {
  name: string
  template: string
  width: number
  height: number
  variants: { label: string }[]
}

function textAudit(rendersDir: string | undefined): string[] {
  if (!existsSync(AUDIT)) return ['No audit SVGs: run `npx tsx powerbi/scripts/validate.ts --manifest-sizes` first.']
  const pageOf = new Map(manifest.reports.flatMap((r) => r.pages.flatMap((p) => p.blocks.map((b) => [b.id, p.id] as const))))
  const rows: string[] = [
    '| Render | Blocks | Texts | Ellipsis (Node) | Ellipsis / outside / overlap (browser) | Outside (est.) | Under 10px | Text height share | Largest empty region | Empty share |',
    '|---|---|---|---|---|---|---|---|---|---|',
  ]
  for (const file of readdirSync(AUDIT).filter((f) => f.endsWith('.json')).sort()) {
    const audit = JSON.parse(readFileSync(`${AUDIT}${file}`, 'utf8')) as AuditJson
    const svgPath = `${AUDIT}${audit.name}.svg`
    if (!existsSync(svgPath)) continue
    const { texts, marks, width, height } = parseSvg(readFileSync(svgPath, 'utf8'))
    const ids = audit.variants.flatMap((v) => v.label.split(', '))
    const where = ids.length > 2 ? `${ids[0]} +${ids.length - 1}` : ids.join(', ')
    const first = ids[0]
    const page = pageOf.get(first) ?? '-'
    const block = first.replace(`${page}.`, '')
    const ellipsis = texts.filter((t) => t.s.includes('…'))
    const outside = texts.filter((t) => t.x0 < -1 || t.y0 < -1 || t.x1 > width + 1 || t.y1 > height + 1)
    const tiny = texts.filter((t) => t.size < 10)
    const lines = new Set<number>()
    for (const t of texts) for (let y = Math.max(0, Math.floor(t.y0)); y < Math.min(height, Math.ceil(t.y1)); y++) lines.add(y)
    const share = height ? lines.size / height : 0
    const empty = emptyRegions(marks, width, height)
    let browser = '-'
    if (rendersDir && existsSync(`${rendersDir}/${audit.name}.txt`)) {
      const report = readFileSync(`${rendersDir}/${audit.name}.txt`, 'utf8').split('\n')
      const count = (k: string) => report.filter((l) => l.includes(`] ${k} `)).length
      const [be, bo, bv] = [count('ELLIPSIS'), count('OUTSIDE'), count('OVERLAP')]
      browser = `${be} / ${bo} / ${bv}`
      if (bo)
        add({ severity: 'high', page, block, fault: `${bo} text items drawn outside the ${width}x${height} block in the browser (e.g. ${report.find((l) => l.includes('OUTSIDE'))?.split('"')[1]})`, fix: 'give the block the height its rows need or cut rows', weight: bo * 1000 })
      if (be)
        add({ severity: 'medium', page, block, fault: `${be} ellipsised strings in the browser`, fix: 'widen the column or shorten the label', weight: be * 100 })
      if (bv)
        add({ severity: 'medium', page, block, fault: `${bv} overlapping text pairs in the browser`, fix: 'space or rotate the labels', weight: bv * 100 })
    }
    if (ellipsis.length && browser === '-')
      add({ severity: 'medium', page, block, fault: `${ellipsis.length} ellipsised strings (Node estimate)`, fix: 'widen the column or shorten the label', weight: ellipsis.length * 100 })
    if (outside.length && browser === '-')
      add({ severity: 'high', page, block, fault: `${outside.length} text items estimated outside the block`, fix: 'give the block more room', weight: outside.length * 1000 })
    if (tiny.length)
      add({
        severity: tiny.length / texts.length > 0.2 ? 'medium' : 'low',
        page,
        block,
        fault: `${tiny.length} of ${texts.length} text items under 10px (smallest ${Math.min(...tiny.map((t) => t.size))}px)`,
        fix: 'raise to the 10px floor or cut the content that forces it down',
        weight: tiny.length * 10,
      })
    if (empty.area)
      add({
        severity: empty.share > 0.25 ? 'medium' : 'low',
        page,
        block,
        fault: `empty region ${empty.largest} (${pct(empty.share)} of the block in 200x120+ empty areas)`,
        fix: 'shrink the block or use the room',
        weight: empty.area,
      })
    rows.push(
      `| ${audit.name} (${audit.variants.length}) | ${where} | ${texts.length} | ${ellipsis.length} | ${browser} | ${outside.length} | ${tiny.length} | ${pct(share)} | ${empty.largest} | ${pct(empty.share)} |`,
    )
  }
  return rows
}

// ---------------------------------------------------------------- Report

const argv = process.argv.slice(2)
const rendersIndex = argv.indexOf('--renders')
const rendersDir = rendersIndex >= 0 ? argv[rendersIndex + 1]?.replace(/[\\/]+$/, '') : undefined

const pages = manifest.reports.flatMap((r) => r.pages)
const geo = pages.map(geometry)
const part2 = textAudit(rendersDir)
findings.sort((a, b) => rank[a.severity] - rank[b.severity] || b.weight - a.weight)

const out: string[] = [
  '# Platform Health layout audit',
  '',
  'Generated by `npm run deneb:audit` (powerbi/scripts/audit-layout.ts) from powerbi/layout/manifest.json and the audit renders in powerbi/preview/audit/. Parts 1 and 2 are measured and regenerated on each run. Parts 3 and 4, below the marker, are judgement written by hand from the app screenshots and the browser renders of each Deneb block.',
  '',
  'Rules. Canvas 1920x1080, page padding 48, gap 20 (8 allowed beside the header row). Severity: overlap, off page or text outside its block is high; squeezed under 80 per cent, misaligned edges, slack or gaps over 60px, ellipsis, overlapping text, text under 10px on more than a fifth of a block and empty area over a quarter of a block are medium; everything else is low.',
  '',
  `Totals: ${findings.filter((f) => f.severity === 'high').length} high, ${findings.filter((f) => f.severity === 'medium').length} medium, ${findings.filter((f) => f.severity === 'low').length} low.`,
  '',
  '## Ranked findings',
  '',
  '| # | Severity | Page | Block | Fault | Suggested fix |',
  '|---|---|---|---|---|---|',
  ...findings.map((f, i) => `| ${i + 1} | ${f.severity} | ${f.page} | ${f.block} | ${f.fault} | ${f.fix} |`),
  '',
  '## Part 1: geometry',
  '',
]
for (const g of geo) {
  out.push(
    `### ${g.page.displayName} (${g.page.id})`,
    '',
    `Edges: ${g.edges}. Slack above footer: ${g.slack}px. Fill of usable area: ${pct(g.fill)}. Overlaps: ${g.overlaps.length ? g.overlaps.join('; ') : 'none'}.`,
    '',
    '| Block | Visual | x | y | w | h | Meta | Size check |',
    '|---|---|---|---|---|---|---|---|',
    ...g.rows,
    '',
    `Gaps: ${g.gaps.join('; ') || 'none'}.`,
    '',
  )
}
out.push(
  '## Part 2: text and density',
  '',
  `One row per (template, size) audit render; the first block is named and the rest counted. Text boxes in the Node SVG are estimated from font size and character count; the browser column is render-blocks.ts at the same size with the real fonts${rendersDir ? '' : ' (not supplied on this run)'}. Text height share is the fraction of the block's height crossed by any text. Empty regions come from a 40px grid of mark boxes, cards and backgrounds excluded.`,
  '',
  ...part2,
  '',
)

const previous = existsSync(REPORT) ? readFileSync(REPORT, 'utf8') : ''
const manual = previous.includes(MANUAL) ? previous.slice(previous.indexOf(MANUAL) + MANUAL.length) : '\n\n## Part 3: the app\n\n## Part 4: relevance and structure\n'
writeFileSync(REPORT, `${out.join('\n')}\n${MANUAL}${manual}`)
console.log(`${pages.length} pages, ${findings.length} findings -> powerbi/preview/audit-report.md`)
for (const f of findings.slice(0, 25)) console.log(`${f.severity.padEnd(6)} ${f.page} ${f.block}: ${f.fault}`)
