import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { LABS, TEAMS } from './data/labs'
import type { LabId, TeamId } from './data/types'
import {
  DEFAULT_PERIOD,
  FilterProvider,
  PERIODS,
  ReportNameContext,
  type FilterState,
  type Period,
} from './filter-context'
import { PAGE_ORDER, REPORTS, pageById, type Report, type ReportPage } from './pages'
import { chrome, slide, themes, type Mode } from './theme'
import { ThemeContext } from './theme-context'

// Fit the fixed 1920x1080 app frame to the browser window for on-screen
// viewing only. Pages are always authored at full size.
function useFitScale(margin: number) {
  const [scale, setScale] = useState(1)
  useLayoutEffect(() => {
    const recompute = () => {
      const sx = (window.innerWidth - margin * 2) / slide.width
      const sy = (window.innerHeight - margin * 2) / slide.height
      setScale(Math.min(1, sx, sy))
    }
    recompute()
    window.addEventListener('resize', recompute)
    return () => window.removeEventListener('resize', recompute)
  }, [margin])
  return scale
}

// Small target glyph for the Spotlight toggle.
const SpotIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    style={{ verticalAlign: '-2px', marginRight: 5 }}
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

const Chevron = ({ dir }: { dir: 'left' | 'right' | 'down' | 'up' }) => (
  <svg
    className={`pbi-chevron pbi-chevron--${dir}`}
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    aria-hidden="true"
  >
    <path d="M9 6l6 6-6 6" />
  </svg>
)

// Workspace mark: a rounded tile with the "PH" monogram. Fills come from CSS.
const WorkspaceMark = () => (
  <svg className="pbi-ws-mark" width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
    <rect width="40" height="40" rx="8" />
    <text x="20" y="25.5" textAnchor="middle">
      PH
    </text>
  </svg>
)

// Service chrome glyphs, drawn as 24px line icons.
const ICONS = {
  waffle: [4, 12, 20].flatMap((y) =>
    [4, 12, 20].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.8" fill="currentColor" />),
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.3-4.3" />
    </>
  ),
  bell: <path d="M6 16v-5a6 6 0 0112 0v5l1.5 2h-15zM10 20.5a2 2 0 004 0" />,
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r="7" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
    </>
  ),
  download: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 015 0c0 1.7-2.5 2-2.5 4M12 17h.01" />
    </>
  ),
  smiley: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 14a4 4 0 007 0M9 9.5h.01M15 9.5h.01" />
    </>
  ),
  file: <path d="M6 3h8l4 4v14H6zM14 3v4h4" />,
  share: <path d="M4 13v7h16v-7M12 3v12M8 7l4-4 4 4" />,
  export: <path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" />,
  teams: (
    <path d="M9 11a3 3 0 100-6 3 3 0 000 6zM3 20a6 6 0 0112 0M17 11a2.5 2.5 0 100-5M21 20a5 5 0 00-4-4.9" />
  ),
  insights: (
    <path d="M9 18h6M10 21h4M12 3a6 6 0 00-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0012 3z" />
  ),
  subscribe: <path d="M3 6h18v12H3zM3 6l9 7 9-7" />,
  more: [5, 12, 19].map((x) => <circle key={x} cx={x} cy="12" r="1.6" fill="currentColor" />),
  refresh: <path d="M20 12a8 8 0 11-2.3-5.7M20 4v5h-5" />,
  bookmark: <path d="M6 3h12v18l-6-4-6 4z" />,
  view: <path d="M3 5h18v14H3zM3 9h18" />,
  reset: <path d="M4 12a8 8 0 108-8 8.6 8.6 0 00-6 2.5L4 8.5M4 4v4.5h4.5" />,
  comments: <path d="M4 4h16v12H9l-5 4zM8 8.5h8M8 12h5" />,
  star: <path d="M12 3l2.8 5.9 6.2.8-4.5 4.3 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.7l6.2-.8z" />,
  edit: <path d="M4 20h4L20 8l-4-4L4 16zM14 6l4 4" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5h.01" />
    </>
  ),
  back: <path d="M19 12H5M11 6l-6 6 6 6" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
} satisfies Record<string, ReactNode>

type IconName = keyof typeof ICONS

const Icon = ({ name, size = 16 }: { name: IconName; size?: number }) => (
  <svg
    className="pbi-icon"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {ICONS[name]}
  </svg>
)

const Caret = () => (
  <svg
    className="pbi-caret"
    width="10"
    height="10"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.6"
    aria-hidden="true"
  >
    <path d="M6 9l6 6 6-6" />
  </svg>
)

const NOT_IN_MOCK = 'Not in mock'
const inert = (e: { preventDefault: () => void }) => e.preventDefault()

type MenuId = 'export' | 'view' | 'more'

interface MenuProps {
  id: string
  open: boolean
  onToggle: () => void
  onClose: () => void
  /** Visible trigger content. */
  trigger: ReactNode
  /** Accessible name when the trigger is icon-only. */
  label?: string
  title?: string
  align?: 'left' | 'right'
  /** Items receive a close function that also returns focus to the trigger. */
  children: (close: () => void) => ReactNode
}

/** A service menu: trigger with aria-expanded, arrow keys between items, Escape closes. */
function Menu({
  id,
  open,
  onToggle,
  onClose,
  trigger,
  label,
  title,
  align = 'left',
  children,
}: MenuProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const close = useCallback(() => {
    onClose()
    triggerRef.current?.focus()
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const wrap = wrapRef.current
    const items = () =>
      Array.from(wrap?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])
    items()[0]?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
      } else if (e.key === 'Tab') {
        onClose()
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const list = items()
        if (!list.length) return
        e.preventDefault()
        const i = list.indexOf(document.activeElement as HTMLElement)
        const step = e.key === 'ArrowDown' ? 1 : -1
        list[(i + step + list.length) % list.length].focus()
      }
    }
    const onDown = (e: MouseEvent) => {
      if (!wrap?.contains(e.target as Node)) onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open, close, onClose])

  return (
    <div ref={wrapRef} className="pbi-menu-wrap">
      <button
        ref={triggerRef}
        type="button"
        className="pbi-tool"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={label}
        title={title}
        onClick={onToggle}
      >
        {trigger}
      </button>
      {open && (
        <div id={id} role="menu" aria-label={label ?? title} className={`pbi-menu pbi-menu--${align}`}>
          {children(close)}
        </div>
      )}
    </div>
  )
}

// Two-letter abbreviation for the collapsed navigation rail.
function abbreviate(name: string) {
  const words = name.split(' ').filter((w) => w !== 'and')
  return words.length > 1
    ? (words[0][0] + words[1][0]).toUpperCase()
    : name.slice(0, 2)
}

// One localStorage blob holds the chrome state, read once at module scope so
// the first render already shows the reader's last choices.
const PERSIST_KEY = 'platform-health-v2'
interface Saved {
  mode?: Mode
  page?: string
  navOpen?: boolean
  filtersOpen?: boolean
}
const SAVED: Saved = (() => {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(PERSIST_KEY) || 'null')
    if (!raw || typeof raw !== 'object') return {}
    const r = raw as Record<string, unknown>
    return {
      mode: r.mode === 'light' || r.mode === 'dark' ? r.mode : undefined,
      page: typeof r.page === 'string' ? r.page : undefined,
      navOpen: typeof r.navOpen === 'boolean' ? r.navOpen : undefined,
      filtersOpen: typeof r.filtersOpen === 'boolean' ? r.filtersOpen : undefined,
    }
  } catch {
    return {}
  }
})()

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Decode a captured PNG to read its pixel size.
async function imageSize(src: string) {
  const img = new Image()
  img.src = src
  await img.decode()
  return { width: img.naturalWidth, height: img.naturalHeight }
}

interface FilterCardProps {
  id: string
  label: string
  summary: string
  expanded: boolean
  onToggle: () => void
  children: ReactNode
}

/** A Power BI filter card: label, value summary and an expandable control. */
function FilterCard({ id, label, summary, expanded, onToggle, children }: FilterCardProps) {
  return (
    <div className="pbi-card">
      <button
        type="button"
        className="pbi-card__head"
        aria-expanded={expanded}
        aria-controls={`filter-card-${id}`}
        onClick={onToggle}
      >
        <span className="pbi-card__text">
          <span className="pbi-card__label">{label}</span>
          <span className="pbi-card__summary">{summary}</span>
        </span>
        <Chevron dir={expanded ? 'up' : 'down'} />
      </button>
      <div id={`filter-card-${id}`} className="pbi-card__body" hidden={!expanded}>
        {children}
      </div>
    </div>
  )
}

export default function App() {
  const [pageId, setPageId] = useState<string>(
    SAVED.page && PAGE_ORDER.some((p) => p.pageId === SAVED.page)
      ? SAVED.page
      : PAGE_ORDER[0].pageId,
  )
  // Reports the reader has expanded or collapsed in the navigation pane; any
  // report without an entry is expanded only while it holds the current page.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [mode, setMode] = useState<Mode>(SAVED.mode ?? 'light')
  const [navOpen, setNavOpen] = useState(SAVED.navOpen ?? true)
  const [filtersOpen, setFiltersOpen] = useState(SAVED.filtersOpen ?? false)
  const [cardsOpen, setCardsOpen] = useState<Record<string, boolean>>({
    lab: true,
    team: true,
    period: true,
  })
  const [presenting, setPresenting] = useState(false)
  const [spotlight, setSpotlight] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportTarget, setExportTarget] = useState<{ report: Report; page: ReportPage } | null>(
    null,
  )
  const [about, setAbout] = useState(false)
  const aboutRef = useRef<HTMLDivElement>(null)
  const aboutCloseRef = useRef<HTMLButtonElement>(null)
  const [openMenu, setOpenMenu] = useState<MenuId | null>(null)
  const closeMenu = useCallback(() => setOpenMenu(null), [])
  const toggleMenu = (m: MenuId) => setOpenMenu((o) => (o === m ? null : m))
  const [labId, setLabId] = useState<LabId | undefined>()
  const [teamId, setTeamId] = useState<TeamId | undefined>()
  const [period, setPeriod] = useState<Period>(DEFAULT_PERIOD)
  const liveRef = useRef<HTMLDivElement>(null)
  const exportRef = useRef<HTMLDivElement>(null)

  const t = themes[mode]
  const fit = useFitScale(presenting ? 0 : 16)
  const { report, page } = pageById(pageId)

  // Canvas viewport is what the bars and panes leave; the page is letterboxed into it.
  const navWidth = navOpen ? chrome.nav : chrome.navRail
  const filtersWidth = filtersOpen ? chrome.filters : chrome.filterStrip
  const viewportW = slide.width - navWidth - filtersWidth - chrome.gutter
  const viewportH =
    slide.height - chrome.globalBar - chrome.actionBar - chrome.statusStrip - chrome.gutter
  const pageScale = presenting ? 1 : Math.min(viewportW / slide.width, viewportH / slide.height)
  const zoom = Math.round(pageScale * 100)

  const isExpanded = (r: Report) => expanded[r.id] ?? r.id === report.id
  const toggleReport = (r: Report) => setExpanded((e) => ({ ...e, [r.id]: !isExpanded(r) }))
  const selectReport = (r: Report) => {
    setExpanded((e) => ({ ...e, [r.id]: true }))
    if (r.id !== report.id) setPageId(r.pages[0].id)
  }

  // Choosing a lab drops a team from another lab; choosing a team selects its lab.
  const setLab = useCallback((id?: LabId) => {
    setLabId(id)
    setTeamId((current) =>
      current && id && TEAMS.find((tm) => tm.id === current)?.labId !== id ? undefined : current,
    )
  }, [])
  const setTeam = useCallback((id?: TeamId) => {
    setTeamId(id)
    if (id) setLabId(TEAMS.find((tm) => tm.id === id)?.labId)
  }, [])
  const clearFilters = () => {
    setLabId(undefined)
    setTeamId(undefined)
    setPeriod(DEFAULT_PERIOD)
  }

  const filters = useMemo<FilterState>(
    () => ({ labId, teamId, period, setLab, setTeam, setPeriod }),
    [labId, teamId, period, setLab, setTeam],
  )

  const labName = LABS.find((l) => l.id === labId)?.name
  const teamName = TEAMS.find((tm) => tm.id === teamId)?.name
  const periodLabel = PERIODS.find((p) => p.id === period)?.label ?? ''
  const teamOptions = labId ? TEAMS.filter((tm) => tm.labId === labId) : TEAMS
  const toggleCard = (id: string) => setCardsOpen((c) => ({ ...c, [id]: !c[id] }))

  // Mirror the mode onto <html data-theme> so every var(--c-*) resolves to the
  // same variant as the page.
  useEffect(() => {
    document.documentElement.dataset.theme = mode
  }, [mode])

  useEffect(() => {
    document.title = `Platform Health · ${report.name} · ${page.label}`
  }, [report, page])

  useEffect(() => {
    try {
      localStorage.setItem(
        PERSIST_KEY,
        JSON.stringify({ mode, page: pageId, navOpen, filtersOpen }),
      )
    } catch {
      /* ignore */
    }
  }, [mode, pageId, navOpen, filtersOpen])

  // The About panel takes focus on open; Escape or a click outside closes it.
  useEffect(() => {
    if (!about) return
    aboutCloseRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbout(false)
    }
    const onDown = (e: MouseEvent) => {
      if (!aboutRef.current?.contains(e.target as Node)) setAbout(false)
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [about])

  // In present mode, arrow keys walk every page in reading order and Escape exits.
  useEffect(() => {
    if (!presenting) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPresenting(false)
        return
      }
      const i = PAGE_ORDER.findIndex((p) => p.pageId === pageId)
      if (e.key === 'ArrowRight' && i < PAGE_ORDER.length - 1) setPageId(PAGE_ORDER[i + 1].pageId)
      if (e.key === 'ArrowLeft' && i > 0) setPageId(PAGE_ORDER[i - 1].pageId)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [presenting, pageId])

  // Spotlight: while on, clicking a [data-spot] block lifts it above a scrim
  // and dims the rest. Clicking another moves it; clicking it again clears.
  useEffect(() => {
    const root = liveRef.current
    if (!root) return
    const frame = () => root.querySelector('.slide-frame')

    if (!spotlight) {
      frame()?.classList.remove('is-spotting')
      root.querySelectorAll('[data-spot].is-spot').forEach((el) => el.classList.remove('is-spot'))
      return
    }

    const onClick = (e: MouseEvent) => {
      const f = frame()
      if (!f) return
      const block = (e.target as HTMLElement).closest('[data-spot]')
      const current = f.querySelector('[data-spot].is-spot')
      if (current) current.classList.remove('is-spot')
      if (block && block !== current) {
        block.classList.add('is-spot')
        f.classList.add('is-spotting')
      } else {
        f.classList.remove('is-spotting')
      }
    }
    root.addEventListener('click', onClick)
    return () => root.removeEventListener('click', onClick)
  }, [spotlight, pageId])

  // Export every page in reading order as a 16:9 .pptx, one full-bleed 2x (3840x2160)
  // image each. Each page is rendered in turn into an unscaled offscreen
  // container, so the canvas scale never reaches the capture.
  const handleExport = async () => {
    if (exporting) return
    setExporting(true)
    try {
      const { toPng } = await import('html-to-image')
      const PptxGen = (await import('pptxgenjs')).default
      await document.fonts.ready

      const shots: { name: string; data: string }[] = []
      for (const ref of PAGE_ORDER) {
        const { report: r, page: p } = pageById(ref.pageId)
        const name = `${r.name} · ${p.label}`
        setExportTarget({ report: r, page: p })
        // Let React commit the page and the browser paint it.
        await wait(350)
        const node = exportRef.current?.querySelector('.slide-frame') as HTMLElement | null
        if (!node) continue
        const data = await toPng(node, {
          pixelRatio: 2,
          cacheBust: true,
          width: slide.width,
          height: slide.height,
        })
        if (import.meta.env.DEV) {
          const size = await imageSize(data)
          console.assert(
            size.width === slide.width * 2 && size.height === slide.height * 2,
            `Export of ${name} is ${size.width}x${size.height}, expected 3840x2160`,
          )
        }
        shots.push({ name, data })
      }

      const pptx = new PptxGen()
      pptx.defineLayout({ name: 'HEALTH16x9', width: 13.333, height: 7.5 })
      pptx.layout = 'HEALTH16x9'
      shots.forEach(({ name, data }) => {
        pptx.addSlide().addImage({ data, x: 0, y: 0, w: 13.333, h: 7.5, altText: name }).addNotes(name)
      })
      await pptx.writeFile({ fileName: 'Platform health.pptx' })
    } finally {
      setExportTarget(null)
      setExporting(false)
    }
  }

  const spotlightButton = (
    <button
      type="button"
      className="pbi-tool"
      onClick={() => setSpotlight((s) => !s)}
      title="Spotlight: click a visual on the page to lift it above a scrim while you talk"
      aria-pressed={spotlight}
    >
      <SpotIcon />
      Spotlight
    </button>
  )

  // Inert service controls, present for realism only.
  const iconButton = (label: string, icon: IconName, caret = false) => (
    <button
      type="button"
      className="pbi-tool pbi-tool--icon"
      aria-label={label}
      aria-disabled="true"
      title={NOT_IN_MOCK}
      onClick={inert}
    >
      <Icon name={icon} />
      {caret && <Caret />}
    </button>
  )
  const textButton = (label: string, icon: IconName, caret = false) => (
    <button
      type="button"
      className="pbi-tool"
      aria-disabled="true"
      title={NOT_IN_MOCK}
      onClick={inert}
    >
      <Icon name={icon} />
      {label}
      {caret && <Caret />}
    </button>
  )

  const reportItem = (r: Report) => {
    const current = r.id === report.id
    if (!navOpen) {
      return (
        <li key={r.id} className="pbi-nav__group">
          <button
            type="button"
            className={`pbi-nav__item${current ? ' is-active' : ''}`}
            aria-current={current ? 'page' : undefined}
            title={r.name}
            onClick={() => selectReport(r)}
          >
            <span className="pbi-nav__abbr" aria-hidden="true">
              {abbreviate(r.name)}
            </span>
            <span className="sr-only">{r.name}</span>
          </button>
        </li>
      )
    }
    const open = isExpanded(r)
    const pagesId = `pbi-nav-pages-${r.id}`
    return (
      <li key={r.id} className="pbi-nav__group">
        <div className="pbi-nav__report-row">
          <button
            type="button"
            className={`pbi-nav__report${current ? ' is-current' : ''}`}
            aria-current={current && !open ? 'page' : undefined}
            onClick={() => selectReport(r)}
          >
            <span className="pbi-nav__name">{r.name}</span>
          </button>
          <button
            type="button"
            className="pbi-nav__expander"
            aria-expanded={open}
            aria-controls={pagesId}
            aria-label={`${open ? 'Collapse' : 'Expand'} ${r.name} pages`}
            title={`${open ? 'Collapse' : 'Expand'} ${r.name} pages`}
            onClick={() => toggleReport(r)}
          >
            <Chevron dir={open ? 'up' : 'down'} />
          </button>
        </div>
        <ul id={pagesId} className="pbi-nav__list pbi-nav__pages" hidden={!open}>
          {r.pages.map((p) => {
            const active = p.id === page.id
            return (
              <li key={p.id}>
                <button
                  type="button"
                  className={`pbi-nav__item${active ? ' is-active' : ''}`}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => setPageId(p.id)}
                >
                  <span className="pbi-nav__name">{p.label}</span>
                  {p.proposed && <span className="pbi-nav__suffix">Proposed</span>}
                </button>
              </li>
            )
          })}
        </ul>
      </li>
    )
  }

  const frameVars = {
    '--nav-w': `${navWidth}px`,
    '--filters-w': `${filtersWidth}px`,
    '--global-h': `${chrome.globalBar}px`,
    '--action-h': `${chrome.actionBar}px`,
    '--status-h': `${chrome.statusStrip}px`,
    '--page-scale': pageScale,
    width: slide.width,
    height: slide.height,
    transform: `scale(${fit})`,
  } as CSSProperties

  return (
    <ThemeContext.Provider value={t}>
      <FilterProvider value={filters}>
        <div
          className="stage"
          data-mode={mode}
          data-presenting={presenting ? 'true' : undefined}
          data-spotlight={spotlight ? 'true' : undefined}
          data-exporting={exporting ? 'true' : undefined}
          style={{ background: t.page }}
        >
          <a className="ui-skip-link" href="#report">
            Skip to the report
          </a>

          {presenting && (
            <div className="present-controls ui-glass">
              {spotlightButton}
              <button
                type="button"
                className="pbi-tool"
                onClick={() => setPresenting(false)}
                title="Leave present mode and return to the app (Escape)"
              >
                Exit present
              </button>
            </div>
          )}

          <div
            className="stage__fit"
            style={{ width: slide.width * fit, height: slide.height * fit }}
          >
            <div
              className="app-frame"
              data-presenting={presenting ? 'true' : undefined}
              style={frameVars}
            >
              {!presenting && (
                <header className="pbi-global" style={{ background: t.chrome }}>
                  <div className="pbi-global__left">
                    {iconButton('App launcher', 'waffle')}
                    <button
                      type="button"
                      className="pbi-tool pbi-global__app"
                      aria-disabled="true"
                      title={NOT_IN_MOCK}
                      onClick={inert}
                    >
                      Platform Health
                      <Caret />
                    </button>
                  </div>
                  <div className="pbi-search">
                    <Icon name="search" size={14} />
                    <input type="search" placeholder="Search" aria-label="Search (not in mock)" />
                  </div>
                  <div className="pbi-global__right">
                    <button
                      type="button"
                      className="pbi-tool pbi-tool--icon pbi-bell"
                      aria-label="Notifications, 1 new"
                      aria-disabled="true"
                      title={NOT_IN_MOCK}
                      onClick={inert}
                    >
                      <Icon name="bell" />
                      <span className="pbi-bell__badge" aria-hidden="true">
                        1
                      </span>
                    </button>
                    {iconButton('Settings', 'gear')}
                    {iconButton('Download', 'download')}
                    {iconButton('Help and support', 'help')}
                    {iconButton('Feedback', 'smiley')}
                    <button
                      type="button"
                      className="pbi-avatar"
                      aria-label="Account manager"
                      aria-disabled="true"
                      title={NOT_IN_MOCK}
                      onClick={inert}
                    >
                      CM
                    </button>
                  </div>
                </header>
              )}

              {!presenting && (
                <div
                  className="pbi-actions"
                  role="toolbar"
                  aria-label="Report actions"
                  style={{ background: t.chrome }}
                >
                  <div className="pbi-actions__left">
                    <button
                      type="button"
                      className="pbi-tool pbi-tool--icon"
                      aria-expanded={navOpen}
                      aria-controls="pbi-nav"
                      aria-label={navOpen ? 'Collapse navigation' : 'Expand navigation'}
                      title={navOpen ? 'Collapse navigation' : 'Expand navigation'}
                      onClick={() => setNavOpen((o) => !o)}
                    >
                      <Chevron dir={navOpen ? 'left' : 'right'} />
                    </button>
                    {textButton('File', 'file', true)}
                    {textButton('Share', 'share', true)}
                    <Menu
                      id="pbi-menu-export"
                      open={openMenu === 'export'}
                      onToggle={() => toggleMenu('export')}
                      onClose={closeMenu}
                      trigger={
                        <>
                          <Icon name="export" />
                          {exporting ? 'Exporting…' : 'Export'}
                          <Caret />
                        </>
                      }
                      title="Export"
                    >
                      {(close) => (
                        <button
                          type="button"
                          role="menuitem"
                          className="pbi-menu__item"
                          aria-disabled={exporting || undefined}
                          title="Export every page to a 16:9 PowerPoint file at 3840×2160"
                          onClick={() => {
                            close()
                            handleExport()
                          }}
                        >
                          <span className="pbi-menu__tick" aria-hidden="true" />
                          {exporting ? 'Exporting…' : 'PowerPoint (mock export)'}
                        </button>
                      )}
                    </Menu>
                    {textButton('Chat in Teams', 'teams')}
                    {textButton('Get insights', 'insights')}
                    {textButton('Subscribe to report', 'subscribe')}
                    <div className="pbi-about">
                      <Menu
                        id="pbi-menu-more"
                        open={openMenu === 'more'}
                        onToggle={() => toggleMenu('more')}
                        onClose={closeMenu}
                        trigger={<Icon name="more" />}
                        label="More options"
                        title="More options"
                      >
                        {(close) => (
                          <button
                            type="button"
                            role="menuitem"
                            className="pbi-menu__item"
                            onClick={() => {
                              close()
                              setAbout(true)
                            }}
                          >
                            <span className="pbi-menu__tick" aria-hidden="true" />
                            About this mock
                          </button>
                        )}
                      </Menu>
                      {about && (
                        <div
                          ref={aboutRef}
                          className="about-panel ui-glass-strong"
                          role="dialog"
                          aria-modal="true"
                          aria-labelledby="about-title"
                        >
                          <h2 id="about-title">About this app</h2>
                          <p>
                            Platform Health brings stability, risk, security, resilience, change,
                            estate, governance, delivery and people into one scored view. Each
                            report shows its measures by lab and team, with the source behind every
                            figure.
                          </p>
                          <p>
                            Scores run from 0 to 100. Healthy is 80 and above, Watch is 60 to 79
                            and Act is below 60. Cost and Operability are proposed domains and are
                            not yet sourced. All figures are illustrative.
                          </p>
                          <p>
                            Pick a report and a page in the navigation pane. Open the Filters strip
                            on the right to filter by lab and team, and to set the period, which
                            controls the trend window. The View menu holds full screen, the light
                            and dark themes and Spotlight; in full screen the arrow keys move
                            between pages. Export, then PowerPoint, writes every page to a deck at
                            3840&times;2160.
                          </p>
                          <button
                            ref={aboutCloseRef}
                            type="button"
                            className="pbi-tool"
                            onClick={() => setAbout(false)}
                          >
                            Close
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="pbi-actions__right">
                    {iconButton('Refresh visuals', 'refresh')}
                    {iconButton('Bookmarks', 'bookmark', true)}
                    <Menu
                      id="pbi-menu-view"
                      open={openMenu === 'view'}
                      onToggle={() => toggleMenu('view')}
                      onClose={closeMenu}
                      trigger={
                        <>
                          <Icon name="view" />
                          <Caret />
                        </>
                      }
                      label="View"
                      title="View"
                      align="right"
                    >
                      {(close) => (
                        <>
                          <button
                            type="button"
                            role="menuitem"
                            className="pbi-menu__item"
                            title="Hide the app chrome; arrow keys move between pages, Escape exits"
                            onClick={() => {
                              close()
                              setPresenting(true)
                            }}
                          >
                            <span className="pbi-menu__tick" aria-hidden="true" />
                            Full screen
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="pbi-menu__item"
                            onClick={() => {
                              close()
                              setMode(mode === 'light' ? 'dark' : 'light')
                            }}
                          >
                            <span className="pbi-menu__tick" aria-hidden="true" />
                            {mode === 'light' ? 'Dark theme' : 'Light theme'}
                          </button>
                          <button
                            type="button"
                            role="menuitemcheckbox"
                            aria-checked={spotlight}
                            className="pbi-menu__item"
                            title="Click a visual on the page to lift it above a scrim while you talk"
                            onClick={() => {
                              close()
                              setSpotlight((v) => !v)
                            }}
                          >
                            <span className="pbi-menu__tick" aria-hidden="true">
                              {spotlight && <Icon name="check" size={14} />}
                            </span>
                            Spotlight
                          </button>
                        </>
                      )}
                    </Menu>
                    {iconButton('Reset to default', 'reset')}
                    {iconButton('Comments', 'comments')}
                    <span className="pbi-actions__sep" aria-hidden="true" />
                    {iconButton('Favourite', 'star')}
                    {iconButton('Edit', 'edit')}
                    {iconButton('Report details', 'info')}
                  </div>
                </div>
              )}

              {!presenting && (
                <nav
                  id="pbi-nav"
                  className={`pbi-nav${navOpen ? '' : ' is-collapsed'}`}
                  aria-label="Reports in this app"
                >
                  <div className="pbi-nav__ws">
                    <WorkspaceMark />
                    {navOpen && <span className="pbi-nav__ws-name">Platform Health</span>}
                  </div>
                  <ul id="pbi-nav-list" className="pbi-nav__list">
                    {REPORTS.map(reportItem)}
                  </ul>
                  {navOpen && (
                    <button
                      type="button"
                      className="pbi-nav__back"
                      aria-disabled="true"
                      title={NOT_IN_MOCK}
                      onClick={inert}
                    >
                      <Icon name="back" />
                      Go back
                    </button>
                  )}
                </nav>
              )}

              <main
                className="pbi-canvas"
                id="report"
                aria-label={`${report.name} report, ${page.label} page`}
                style={{ background: t.canvas }}
              >
                <div ref={liveRef} className="pbi-canvas__page">
                  <ReportNameContext.Provider value={`${report.name} · ${page.label}`}>
                    {page.render()}
                  </ReportNameContext.Provider>
                </div>
              </main>

              {!presenting && (
                <aside
                  className={`pbi-filters${filtersOpen ? '' : ' is-collapsed'}`}
                  aria-label="Filters"
                  style={{ background: t.chrome }}
                >
                  <div className="pbi-filters__head">
                    {filtersOpen && <h2 className="pbi-filters__title">Filters</h2>}
                    <button
                      type="button"
                      className="pbi-filters__toggle"
                      aria-expanded={filtersOpen}
                      aria-controls="pbi-filters-body"
                      aria-label={filtersOpen ? 'Collapse filters pane' : 'Expand filters pane'}
                      title={filtersOpen ? 'Collapse filters pane' : 'Expand filters pane'}
                      onClick={() => setFiltersOpen((o) => !o)}
                    >
                      <Chevron dir={filtersOpen ? 'right' : 'left'} />
                      {!filtersOpen && (
                        <span className="pbi-filters__strip-label" aria-hidden="true">
                          Filters
                        </span>
                      )}
                    </button>
                  </div>
                  <div id="pbi-filters-body" className="pbi-filters__body" hidden={!filtersOpen}>
                    <h3 className="pbi-filters__section">Filters on this page</h3>
                    <FilterCard
                      id="period"
                      label="Period"
                      summary={`is ${periodLabel}`}
                      expanded={cardsOpen.period}
                      onToggle={() => toggleCard('period')}
                    >
                      <fieldset className="pbi-radios">
                        <legend className="sr-only">Period</legend>
                        {PERIODS.map((p) => (
                          <label key={p.id} className="pbi-radio">
                            <input
                              type="radio"
                              name="period"
                              value={p.id}
                              checked={period === p.id}
                              onChange={() => setPeriod(p.id)}
                            />
                            {p.label}
                          </label>
                        ))}
                      </fieldset>
                    </FilterCard>

                    <h3 className="pbi-filters__section">Filters on all pages</h3>
                    <FilterCard
                      id="lab"
                      label="Lab"
                      summary={`is ${labName ?? 'All'}`}
                      expanded={cardsOpen.lab}
                      onToggle={() => toggleCard('lab')}
                    >
                      <select
                        aria-label="Lab"
                        value={labId ?? ''}
                        onChange={(e) => setLab((e.target.value || undefined) as LabId | undefined)}
                      >
                        <option value="">All labs</option>
                        {LABS.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                      </select>
                    </FilterCard>
                    <FilterCard
                      id="team"
                      label="Team"
                      summary={`is ${teamName ?? 'All'}`}
                      expanded={cardsOpen.team}
                      onToggle={() => toggleCard('team')}
                    >
                      <select
                        aria-label="Team"
                        value={teamId ?? ''}
                        onChange={(e) =>
                          setTeam((e.target.value || undefined) as TeamId | undefined)
                        }
                      >
                        <option value="">All teams</option>
                        {teamOptions.map((tm) => (
                          <option key={tm.id} value={tm.id}>
                            {tm.name}
                          </option>
                        ))}
                      </select>
                    </FilterCard>

                    <button type="button" className="pbi-filters__clear" onClick={clearFilters}>
                      Clear filters
                    </button>
                  </div>
                </aside>
              )}

              {!presenting && (
                <div className="pbi-status" style={{ background: t.chrome }}>
                  <span className="pbi-zoom__track" aria-hidden="true">
                    <span className="pbi-zoom__knob" style={{ left: `${zoom}%` }} />
                  </span>
                  <span className="pbi-zoom__readout">
                    <span className="sr-only">Zoom </span>
                    {zoom}%
                  </span>
                  <button
                    type="button"
                    className="pbi-tool pbi-status__fit"
                    aria-disabled="true"
                    title={NOT_IN_MOCK}
                    onClick={inert}
                  >
                    Fit to page
                    <Caret />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Unscaled offscreen render target for PPTX capture. */}
          {exportTarget && (
            <div ref={exportRef} className="export-stage" aria-hidden="true" inert>
              <ReportNameContext.Provider
                value={`${exportTarget.report.name} · ${exportTarget.page.label}`}
              >
                {exportTarget.page.render()}
              </ReportNameContext.Provider>
            </div>
          )}
        </div>
      </FilterProvider>
    </ThemeContext.Provider>
  )
}
