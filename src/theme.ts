// ---------------------------------------------------------------------------
// Theme tokens
// ---------------------------------------------------------------------------
// Every value is a var(--c-*) reference. The Platform Health palette is set as
// token overrides in styles.css (light on :root, dark on [data-theme="dark"]),
// and App mirrors its mode onto <html data-theme>, so both modes reference the
// same names and the attribute does the switching.

import type { HealthBand, LabId, Readiness } from './data/types'

export type Mode = 'light' | 'dark'

// Fixed page canvas. Never responds to viewport; a capture of .slide-frame at
// 2x yields a clean 3840x2160 PNG.
export const slide = {
  width: 1920,
  height: 1080,
  padding: 48,
  headerHeight: 120,
  gap: 20,
  radius: 18,
} as const

// Power BI service chrome around the canvas, in px on the 1920x1080 app frame.
// The canvas viewport is whatever the panes leave, and the report page is
// scaled to fit it.
export const chrome = {
  globalBar: 40,
  actionBar: 36,
  statusStrip: 24,
  nav: 240,
  navRail: 48,
  filters: 280,
  filterStrip: 32,
  gutter: 24,
} as const

export interface ThemeTokens {
  mode: Mode
  /** Neutral area around the page. */
  page: string
  /** Grey surround the report page sits on, as in the Power BI service. */
  canvas: string
  /** Top bar, navigation and filter panes. */
  chrome: string
  /** Page canvas. */
  paper: string
  /** Card surface. */
  surface: string
  /** Quiet surface inside cards. */
  cream: string
  /** Pale sage supporting surface. */
  panel: string
  panelAlt: string
  line: string
  gridline: string
  ink: string
  brand: string
  brandMid: string
  brandSoft: string
  muted: string
  /** Emerald highlight. */
  green: string
  /** Warnings and friction. */
  amber: string
  /** Reserved for the Act state. */
  red: string
  bands: Record<HealthBand, { fill: string; text: string; key: string }>
  readiness: Record<Readiness, { fill: string; text: string; key: string }>
}

const tokens = (mode: Mode): ThemeTokens => ({
  mode,
  page: 'var(--c-panel-alt)',
  canvas: 'var(--c-canvas)',
  chrome: 'var(--c-surface)',
  paper: 'var(--c-bg)',
  surface: 'var(--c-surface)',
  cream: 'var(--c-cream)',
  panel: 'var(--c-panel)',
  panelAlt: 'var(--c-panel-alt)',
  line: 'var(--c-line)',
  gridline: 'var(--c-gridline)',
  ink: 'var(--c-ink)',
  brand: 'var(--c-brand)',
  brandMid: 'var(--c-brand-mid)',
  brandSoft: 'var(--c-brand-soft)',
  muted: 'var(--c-muted)',
  green: 'var(--c-green)',
  amber: 'var(--c-amber)',
  red: 'var(--c-red)',
  bands: {
    healthy: { fill: 'var(--c-good-fill)', text: 'var(--c-ink)', key: 'var(--c-green)' },
    watch: { fill: 'var(--c-warn-fill)', text: 'var(--c-ink)', key: 'var(--c-amber)' },
    act: { fill: 'var(--c-bad-fill)', text: 'var(--c-ink)', key: 'var(--c-red)' },
  },
  readiness: {
    live: { fill: 'var(--c-good-fill)', text: 'var(--c-ink)', key: 'var(--c-green)' },
    partial: { fill: 'var(--c-warn-fill)', text: 'var(--c-ink)', key: 'var(--c-amber)' },
    aspirational: { fill: 'var(--c-panel)', text: 'var(--c-ink)', key: 'var(--c-brand-soft)' },
  },
})

export const lightTheme: ThemeTokens = tokens('light')
export const darkTheme: ThemeTokens = tokens('dark')

export const themes: Record<Mode, ThemeTokens> = {
  light: lightTheme,
  dark: darkTheme,
}

// One colour per lab, in LABS order. Power BI carries the same four light hexes
// at dataColors 9 to 12 in powerbi/theme/platform-health.theme.json.
export const labColours: Record<LabId, string> = {
  core: 'var(--c-lab-1)',
  customer: 'var(--c-lab-2)',
  payments: 'var(--c-lab-3)',
  data: 'var(--c-lab-4)',
}

// Typographic scale (px on the 1920x1080 canvas). Nothing on a page goes below
// `meta`, so a projected report reads from the back of the room.
export const type = {
  pageTitle: 44,
  headline: 24,
  kicker: 14,
  sectionHead: 15,
  kpiValue: 40,
  cardTitle: 17,
  body: 15,
  meta: 13.5,
  chip: 12.5,
} as const
