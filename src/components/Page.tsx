import type { CSSProperties, ReactNode } from 'react'
import { useReportName } from '../filter-context'
import { slide, type as ty } from '../theme'
import { useTheme } from '../theme-context'
import { REFRESHED_ISO, sourcesLine } from '../data/sourceRefresh'

/** The date the mock data was last refreshed, as a long date. */
export const REFRESHED = '28 September 2026'
export { REFRESHED_ISO }

/** Header, text column and footer sizes from the Power BI manifest: the page-text block is 1284x140 and the footer 36px, 48px from the bottom. */
const HEADER_H = 140
const HEADER_TEXT_W = 1284
const FOOTER_H = 36

interface PageProps {
  /** The page name; the kicker reads "<report> · <page>". */
  kicker: string
  title: string
  /** One strategic sentence under the title. */
  headline?: string
  /** A short muted line beside the kicker, clear of the 140px header. */
  note?: ReactNode
  children: ReactNode
  /** Grid template for the body, e.g. gridTemplateColumns and gridTemplateRows. */
  bodyStyle?: CSSProperties
  /** Source systems behind the page; the footer lists their last refresh. */
  sources?: string[]
}

/**
 * The fixed 1920x1080 report page: header (kicker, the one h1, headline and
 * an optional note), a grid body that fills the remaining height, and a footer
 * naming the page and when its source systems last refreshed.
 */
export function Page({ kicker, title, headline, note, children, bodyStyle, sources = [] }: PageProps) {
  const t = useTheme()
  const reportName = useReportName()
  return (
    <div
      className="slide-frame"
      style={{
        width: slide.width,
        height: slide.height,
        padding: slide.padding,
        background: t.paper,
        color: t.ink,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 32,
          height: HEADER_H,
          flex: 'none',
        }}
      >
        <div style={{ flex: 'none', width: HEADER_TEXT_W, minWidth: 0 }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: ty.kicker,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: t.muted,
              marginBottom: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <span style={{ flex: 'none' }}>{reportName || kicker}</span>
            {note && (
              <span
                style={{
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontFamily: 'var(--font-body)',
                  letterSpacing: 0,
                  textTransform: 'none',
                }}
              >
                {note}
              </span>
            )}
          </div>
          <h1
            style={{
              margin: 0,
              fontFamily: 'var(--font-display)',
              fontSize: ty.pageTitle,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: '-0.01em',
            }}
          >
            {title}
          </h1>
          {headline && (
            <p
              style={{
                margin: '10px 0 0',
                fontFamily: 'var(--font-display)',
                fontSize: ty.headline,
                fontWeight: 400,
                lineHeight: 1.3,
                color: t.brandMid,
                maxWidth: 1180,
              }}
            >
              {headline}
            </p>
          )}
        </div>
        {/* Logo placeholder at the top right; the lab legend, where a page has one, sits beneath it. */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: slide.padding,
            right: slide.padding,
            width: 120,
            height: 40,
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: `1px dashed ${t.line}`,
            borderRadius: 8,
            fontFamily: 'var(--font-mono)',
            fontSize: ty.chip,
            letterSpacing: '0.14em',
            color: t.muted,
          }}
        >
          LOGO
        </div>
      </header>

      <div
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          marginTop: slide.gap,
          display: 'grid',
          gap: slide.gap,
          ...bodyStyle,
        }}
      >
        {children}
      </div>

      <footer
        style={{
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          height: FOOTER_H,
          boxSizing: 'border-box',
          marginTop: slide.gap,
          paddingTop: 12,
          borderTop: `1px solid ${t.line}`,
          fontFamily: 'var(--font-mono)',
          fontSize: ty.chip,
          letterSpacing: '0.06em',
          color: t.muted,
        }}
      >
        <span>Platform Health &middot; {reportName || title}</span>
        <span style={{ flex: 1 }} />
        <span>{sourcesLine(sources)}</span>
      </footer>
    </div>
  )
}
