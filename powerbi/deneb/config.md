# Shared Deneb config

`config.json` is the Vega-Lite `config` object every spec uses. Paste it into the Config pane of each Deneb visual. Colours are copied from the light token block in `src/styles.css` and must be kept in step with it.

- **background transparent.** The Power BI visual container draws the white card, border and radius from the report theme, so the chart must not paint over it.
- **font "Segoe UI, wf_segoe-ui_normal, Arial, sans-serif".** Power BI's own body face, available on every Windows host. `wf_segoe-ui_normal` is the web font the Power BI service loads, and Arial covers hosts with neither.
- **title font "Fraunces, Cambria, Georgia, serif".** Deneb renders with whatever fonts the host has. Fraunces is the app's display face where installed. Cambria comes next because its figures are lining, not old-style: Georgia's old-style zero reads as a stray "o" in a number such as "0 past due". Georgia stays as the last resort for hosts without Cambria.
- **title anchored start, 17px, weight 600, evergreen.** Matches the serif card titles in the mock.
- **axis: no domain line, no ticks, gridlines #E6E8E2, labels #5F6E69.** The mock's charts carry light gridlines and muted labels only. The x axis has no gridlines.
- **legend disabled.** Charts label series directly; a spec that needs a legend turns it back on for that one encoding.
- **view stroke none.** No box around the plot area.
- **range.category.** The report theme's data colours in the same order: evergreen, emerald, sage, amber, red, then the evergreen tint and neutrals.
- **line, point, text and rule defaults.** Evergreen 2.5px round lines, filled emerald points, evergreen text, hairline rules, so a spec only states what differs.

## Colour params

Vega-Lite `config` has no `params` key, so named colours cannot live in `config.json`. Every spec opens its top-level `params` with this block, identical in each, and refers to a colour with `{"expr": "emerald"}` wherever a mark property takes a colour, or by name inside a `calculate` expression. None is bound to an input. Paste the block once and it serves every spec; any layout params a spec needs (such as `labelWidth`) follow after it.

```json
"params": [
  { "name": "evergreen", "expr": "pbiColor(0)" },
  { "name": "emerald", "expr": "pbiColor(1)" },
  { "name": "sage", "value": "#DCE8E0" },
  { "name": "amber", "expr": "pbiColor(3)" },
  { "name": "red", "expr": "pbiColor(4)" },
  { "name": "ink", "expr": "pbiColor(0)" },
  { "name": "muted", "expr": "pbiColor(6)" },
  { "name": "line", "expr": "pbiColor(8)" },
  { "name": "surface", "value": "#FFFFFF" },
  { "name": "cream", "value": "#F7F6F2" },
  { "name": "goodFill", "value": "#DDF0E8" },
  { "name": "warnFill", "value": "#F5EAD6" },
  { "name": "badFill", "value": "#F3E0DA" }
]
```

Seven colours come from the report theme through Deneb's `pbiColor(index)`, which returns the theme's `dataColors` entry at that zero-based index. The other six have no counterpart in `dataColors` and stay literal:

| Param | Source | Colour with the Platform Health theme |
| --- | --- | --- |
| `evergreen` | `pbiColor(0)` | `#0F4D43` |
| `emerald` | `pbiColor(1)` | `#0B8A6B` |
| `sage` | literal | `#DCE8E0` |
| `amber` | `pbiColor(3)` | `#B9852C` |
| `red` | `pbiColor(4)` | `#B6462F` |
| `ink` | `pbiColor(0)` | `#0F4D43` |
| `muted` | `pbiColor(6)` | `#5F6E69` |
| `line` | `pbiColor(8)` | `#D6D9D2` |
| `surface`, `cream`, `goodFill`, `warnFill`, `badFill` | literal | as in the block |

`pbiColor` exists only inside Deneb, so these specs no longer render in the plain Vega editor. The validator registers a stand-in that reads `theme/platform-health.theme.json`; see Interactivity and theme in the pack README. If you reorder the theme's `dataColors`, change the indices here and in every spec.

Vega-Lite gradient stops take a plain colour string, not an expression. A gradient fill is therefore written as one `{"expr": ...}` that returns the whole gradient object, with each stop colour built from a param, for example `'rgba(' + rgb(emerald).r + ',' + rgb(emerald).g + ',' + rgb(emerald).b + ',0.25)'`. trend-target does this for its area.

`sage` is the pale panel colour (`--c-panel`), used for bands and fills. The darker sage in `range.category` (`--c-brand-soft`) is for data series. `surface` is the card white and `cream` the quiet inner surface. `goodFill`, `warnFill` and `badFill` are the pale band fills (`--c-good-fill`, `--c-warn-fill`, `--c-bad-fill`).

## Band pills and cells

Band state is never a solid fill with white text. A pill has a pale band fill, a dot in the band colour, the band word in `ink`, and a 1px stroke of the band colour at 35% opacity. The word is never in the band colour, which falls below 4.5:1 contrast on the pale fill:

| Band | Fill | Dot and stroke | Text |
| --- | --- | --- | --- |
| healthy | `goodFill` | `emerald` | `ink` |
| watch | `warnFill` | `amber` | `ink` |
| act | `badFill` | `red` | `ink` |
| context | `sage` | `muted` | `ink` |

Pill words are 12.5px mono, weight 600, in capitals. Heat cells use the same pale fill with ink text and a 3px band-colour stripe on the left edge.

## Card titles

Every card spec draws its title as a kicker, not a serif heading. The title text comes from a `title` param in capitals, so a layout block can override it through its params. The title block is the same in each spec:

- **Kicker.** `JetBrains Mono, Consolas, monospace`, 12.5px, weight 600, `muted`, anchored start, offset 6 (8 on read-outs and sources-strip). The monospace face gives the letter-spaced look; Vega titles have no letter-spacing property.
- **Subtitle.** Where a card has a descriptive sentence, it sits under the kicker in `Segoe UI, wf_segoe-ui_normal, Arial, sans-serif`, 12px, `muted`, with 4px padding.
- **No serif titles inside cards.** Fraunces is kept for values, page titles and headlines.

bar-list reads "ACTIONS BY DOMAIN" when `unitLabel` is "actions" and `title` is left at its default. trend-target drops its title when the plot is under 140px tall.

## Type sizes

| Role | Face | Size |
| --- | --- | --- |
| Kicker | `JetBrains Mono, Consolas, monospace`, weight 600, capitals, muted | 12.5px |
| Pill word | `JetBrains Mono, Consolas, monospace`, weight 600, capitals, ink | 12.5px |
| Card and chart title | `JetBrains Mono, Consolas, monospace`, weight 600, capitals, muted (see Card titles) | 12.5px |
| Headline value | `Fraunces, Cambria, Georgia, serif`, weight 600 | 36px and up |
| Row labels and meta text | `Segoe UI, wf_segoe-ui_normal, Arial, sans-serif` | 13px |
| Column headers in dense grids | `Fraunces, Cambria, Georgia, serif`, weight 600 | 12px; 11px in the heat matrix, whose twelve columns are narrower |

Vega text marks have no letter-spacing property, so kickers cannot carry the app's 0.06em tracking.
