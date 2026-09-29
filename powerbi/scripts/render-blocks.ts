// Draws every audit spec that `validate.ts --manifest-sizes` wrote to
// preview/audit/ in headless Edge, at its Power BI size with the real fonts, so
// Vega measures and truncates text as it will in Deneb. For each (template,
// width, height) it writes a wrapper HTML, a PNG screenshot of every page
// variant, and a report of ellipsised text, text past the container and
// overlapping text. The browser render, not the Node SVG, is the truth.
// Edge on Windows writes nothing to stdout, so one headless Edge is driven over
// the DevTools protocol instead of --screenshot and --dump-dom.
//
//   npx tsx powerbi/scripts/render-blocks.ts <outDir> [name filter]
import { spawn } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

const AUDIT = fileURLToPath(new URL('../preview/audit/', import.meta.url))
const MODULES = new URL('../../node_modules/', import.meta.url).href
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const FONTS =
  'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Inter:wght@400;600&family=JetBrains+Mono:wght@400;600&display=block'
const LABEL = 20
const GAP = 16

interface Audit {
  name: string
  width: number
  height: number
  variants: { label: string }[]
}

const [outArg, only] = process.argv.slice(2)
if (!outArg) {
  console.error('Usage: render-blocks.ts <outDir> [name filter]')
  process.exit(2)
}
const out = outArg.replace(/[\\/]*$/, '/')
mkdirSync(out, { recursive: true })

/** Runs in the page: registers the Deneb stand-ins, renders each variant, then checks its text. */
const pageScript = String.raw`
const audit = window.AUDIT
const theme = audit.theme
vega.expressionFunction('pbiColor', (k) => (typeof k === 'number' ? theme.dataColors[k % theme.dataColors.length] : theme[k]))
vega.expressionFunction('pbiFormat', (v, f) => (f === '0%' ? (v * 100).toFixed(0) + '%' : '£' + Math.round(v).toLocaleString('en-GB')))
vega.expressionFunction('pbiPatternSVG', (_id, fg) => fg || 'transparent')
const fonts = ['400 12px "Fraunces"', '600 12px "Fraunces"', '400 12px "JetBrains Mono"', '600 12px "JetBrains Mono"', '400 12px "Inter"', '600 12px "Inter"']
async function run() {
  await Promise.all(fonts.map((f) => document.fonts.load(f).catch(() => null)))
  const lines = ['fonts: ' + fonts.map((f) => f + '=' + document.fonts.check(f)).join(' ')]
  for (const [i, v] of audit.variants.entries()) {
    const box = document.getElementById('v' + i)
    try {
      const view = new vega.View(vega.parse(vegaLite.compile(v.spec).spec), { renderer: 'svg', container: box, hover: false })
      await view.runAsync()
    } catch (e) {
      lines.push('[' + v.label + '] ERROR ' + e.message)
      continue
    }
    const b = box.getBoundingClientRect()
    const texts = [...box.querySelectorAll('text')].filter((t) => t.textContent.trim()).map((t) => {
      const r = t.getBoundingClientRect()
      return { s: t.textContent, x: r.left - b.left, y: r.top - b.top, r: r.right - b.left, bt: r.bottom - b.top }
    })
    for (const t of texts) {
      if (t.s.includes('…')) lines.push('[' + v.label + '] ELLIPSIS "' + t.s + '"')
      if (t.x < -0.5 || t.y < -0.5 || t.r > audit.width + 0.5 || t.bt > audit.height + 0.5)
        lines.push('[' + v.label + '] OUTSIDE "' + t.s + '" ' + [t.x, t.y, t.r, t.bt].map(Math.round).join(','))
    }
    for (let a = 0; a < texts.length; a++)
      for (let c = a + 1; c < texts.length; c++) {
        const p = texts[a], q = texts[c]
        const ox = Math.min(p.r, q.r) - Math.max(p.x, q.x), oy = Math.min(p.bt, q.bt) - Math.max(p.y, q.y)
        if (ox > 2 && oy > 4 && p.s !== q.s) lines.push('[' + v.label + '] OVERLAP "' + p.s + '" / "' + q.s + '"')
      }
  }
  window.REPORT = lines.join('\n')
}
run().catch((e) => (window.REPORT = 'ERROR ' + e.message))
`

function wrapper(audit: Audit, json: string): string {
  const boxes = audit.variants
    .map(
      (v, i) =>
        `<div class="label">${v.label.replace(/</g, '&lt;')}</div><div id="v${i}" class="box" style="width:${audit.width}px;height:${audit.height}px"></div>`,
    )
    .join('\n')
  return `<!doctype html>
<html><head><meta charset="utf-8">
<link rel="stylesheet" href="${FONTS}">
<style>
body { margin: 0; padding: 8px 16px; background: #F2F0EA; font: 12px Consolas, monospace; color: #5F6E69 }
.label { height: ${LABEL}px; line-height: ${LABEL}px; white-space: nowrap; overflow: hidden }
.box { position: relative; overflow: hidden; outline: 1px dashed #C9C5B8; margin-bottom: ${GAP}px }
</style>
<script src="${MODULES}vega/build/vega.min.js"></script>
<script src="${MODULES}vega-lite/build/vega-lite.min.js"></script>
</head><body>
${boxes}
<script>window.AUDIT = ${json.replace(/</g, '\\u003c')}</script>
<script>${pageScript}</script>
</body></html>`
}

const PORT = 9333
const browser = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', `--remote-debugging-port=${PORT}`, `--user-data-dir=${out}edge-profile`, 'about:blank'], {
  stdio: 'ignore',
})
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function pageSocket(): Promise<string> {
  for (let i = 0; i < 50; i += 1) {
    try {
      const targets = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()) as { type: string; webSocketDebuggerUrl: string }[]
      const page = targets.find((t) => t.type === 'page')
      if (page) return page.webSocketDebuggerUrl
    } catch {
      // Edge is still starting.
    }
    await pause(200)
  }
  throw new Error('Edge did not open a debugging port')
}

const ws = new WebSocket(await pageSocket())
await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }))
let nextId = 0
const pending = new Map<number, (result: Record<string, unknown>) => void>()
ws.addEventListener('message', (e) => {
  const msg = JSON.parse(String(e.data)) as { id?: number; result?: Record<string, unknown> }
  if (msg.id !== undefined) pending.get(msg.id)?.(msg.result ?? {})
})
const send = (method: string, params: Record<string, unknown> = {}) =>
  new Promise<Record<string, unknown>>((resolve) => {
    nextId += 1
    pending.set(nextId, resolve)
    ws.send(JSON.stringify({ id: nextId, method, params }))
  })
const evaluate = async (expression: string) =>
  ((await send('Runtime.evaluate', { expression, returnByValue: true })).result as { value?: unknown } | undefined)?.value

const summary: string[] = []
try {
  for (const file of readdirSync(AUDIT).filter((f) => f.endsWith('.json') && (!only || f.includes(only))).sort()) {
    const json = readFileSync(`${AUDIT}${file}`, 'utf8')
    const audit = JSON.parse(json) as Audit
    const html = `${out}${audit.name}.html`
    writeFileSync(html, wrapper(audit, json))
    const width = audit.width + 32
    const height = 16 + audit.variants.length * (LABEL + audit.height + GAP)
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
    await send('Page.navigate', { url: pathToFileURL(html).href })
    let report: unknown
    for (let i = 0; i < 100 && typeof report !== 'string'; i += 1) {
      await pause(150)
      report = await evaluate('window.REPORT')
    }
    if (typeof report !== 'string') report = 'no report: render did not finish'
    const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width, height, scale: 1 }, captureBeyondViewport: true })
    writeFileSync(`${out}${audit.name}.png`, Buffer.from(String(shot.data), 'base64'))
    writeFileSync(`${out}${audit.name}.txt`, String(report))
    const lines = String(report).split('\n')
    if (!summary.length) console.log(lines[0])
    const faults = lines.filter((l) => !l.startsWith('fonts:'))
    summary.push(
      `${faults.length ? 'FAULT' : 'ok   '} ${audit.name} (${audit.variants.length})` +
        (faults.length ? `\n  ${faults.slice(0, 12).join('\n  ')}${faults.length > 12 ? `\n  ... ${faults.length - 12} more` : ''}` : ''),
    )
  }
} finally {
  ws.close()
  browser.kill()
}
writeFileSync(`${out}summary.txt`, summary.join('\n'))
console.log(summary.join('\n'))
