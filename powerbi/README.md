# Platform Health: Power BI pack

This folder turns the Platform Health mock into material a Power BI report builder can use. It holds a report theme, a shared Deneb config, twenty-nine Deneb specs, sample data exported from the mock, rendered previews and a script that checks every spec compiles and renders. Everything a builder needs is in this file.

## The hybrid rule

Chrome and the filter pane stay native Power BI. Every block on every page is a Deneb visual, with one exception: the footer text, a text box with static text and the refresh date. Page headers are page-text, tables are actions-list, actions-table, team-matrix, movement-table, sources-strip and lineage-table, and read-outs are read-outs; no native table, matrix or card remains. The project has 186 visuals over twenty-one pages. The footer takes its look from the theme; Deneb visuals take theirs from `deneb/config.json`. Both are copied from the same token block, so they match.

## What is here

| Path | What it is |
| --- | --- |
| `theme/platform-health.theme.json` | Power BI report theme: palette, fonts, card styling, page and filter pane colours |
| `deneb/config.json` | Vega-Lite config shared by every Deneb visual. `deneb/config.md` explains each choice, the shared colour params, band pills and type sizes |
| `deneb/specs/*.vl.json` | One Vega-Lite spec per visual |
| `deneb/specs/*.meta.json` | The sample file, filter and preview size the validator uses for that spec |
| `deneb/samples/*.json` | Sample rows in the shape the dataset should deliver, generated from the mock |
| `deneb/templates/*.deneb.json` | One importable Deneb template per spec, with field placeholders. `deneb/templates/INDEX.md` lists each template's fields |
| `preview/*.svg` | Rendered previews, written by the validator |
| `preview/index.html` | A hand-written gallery that lays the previews out as three report pages |
| `scripts/` | The sample export, template build and validation scripts |

## Building it

`BUILD-GUIDE.md` walks a Power BI author through the whole build: model, theme, report settings, then every page block by block, publishing as an app and the checks to expect. `layout/manifest.json` holds the same layout in machine-readable form: every block's visual, position, fields, filters and formatting on the 1920 by 1080 page. Regenerate it with `npm run deneb:layout`, which fails if a block names a missing template, column or measure.

## Project file

`pbip/PlatformHealth/` is a Power BI Project built from the manifest, so the model, measures, theme, pages and Deneb visuals arrive already in place. It has been opened in Power BI Desktop once, and the two errors that open reported are fixed (see Desktop feedback below). Treat the next open as a test and expect to correct a few details.

**What it holds.**

| Path | What it is |
| --- | --- |
| `PlatformHealth.pbip` | The file to open |
| `PlatformHealth.SemanticModel/definition/` | The model in TMDL: the eight CSV tables with typed columns and a Power Query partition each, the calculated Period and MovementStep tables, `_Measures` with every measure from `model/measures.dax`, build measures included (display folder `Build measures`), the seven relationships, sort-by columns, culture en-GB and Auto date/time off |
| `PlatformHealth.SemanticModel/definition/expressions.tmdl` | The `CsvFolder` parameter: the folder the CSV tables load from |
| `PlatformHealth.Report/definition/` | The report in PBIR: twenty-one 1920 by 1080 pages in the manifest's order, every block as a visual at its manifest position, report filters on Lab and Team, page filters for Period and Domain |
| `PlatformHealth.Report/StaticResources/RegisteredResources/PlatformHealth.json` | The theme, a copy of `theme/platform-health.theme.json` |

Regenerate it with `npm run deneb:pbip`. The script rewrites both `definition` folders and the theme copy, leaves Desktop's own `.pbi` folders alone, and fails if any JSON does not parse, a field or filter names a column or measure the model lacks, a table leaves out a CSV column, a relationship names a missing column, or the measure count is off. Edits made in Desktop are lost on regenerate, so change the manifest or the script instead.

Every Deneb visual renders in `canvas` mode for performance; switch a visual to `svg` in Desktop for a crisper export where that matters more than render speed.

**How to open it.**

1. Install Deneb from AppSource in Desktop first (Get more visuals). Without it, the 47 Deneb visuals show as missing custom visuals.
2. Open `pbip/PlatformHealth/PlatformHealth.pbip`.
3. Check `CsvFolder` (Transform data, Manage parameters) holds the full path of `model/csv`, then Refresh. See Local CSV folder below.
4. Check the Deneb GUID (below) if any Deneb visual shows as "can't display this visual".

**Local CSV folder.** The committed `expressions.tmdl` sets `CsvFolder` to the placeholder `C:\PlatformHealth\model\csv`, which will not exist. To load the CSVs straight away, create `powerbi/local.json` holding `{ "csvFolder": "<absolute path to powerbi/model/csv>" }` and run `npm run deneb:pbip`; the script then writes that path instead. The file is git-ignored because the path is machine-specific. Once it exists, `expressions.tmdl` in your working tree carries your local path, so leave that change out of commits. After `git pull` on another machine, either create `local.json` there and regenerate, or set the parameter in Desktop.

**Desktop feedback.** The first open in Desktop (29 September 2026) failed in two ways:

- Every table partition reported "Could not find a part of the path" for the placeholder `CsvFolder`. `local.json` now covers this.
- `_Measures` rejected every measure that used the table `Action` without quotes, or a variable named `Value`, `Start`, `Rows` or `Open`. Desktop reads those as reserved or function-like tokens. Measures without them parsed.

Two rules follow for every measure and calculated table in `model/measures.dax`. Single-quote every table reference, as in `'Action'[DueDate]` and `REMOVEFILTERS ( 'Quarter' )`. Start every variable name with an underscore, as in `VAR _Value`. `npm run deneb:pbip` lints for both before it writes anything, and fails with the measure and line of each breach.

The second open (29 September 2026) loaded the model and drew the Deneb visuals with the theme. Six faults showed on the Overview, all now addressed in the generator:

- Every domain card showed 75 and the same driver; the heat matrix showed one value per lab. Measures cleared the whole `'Metric'` table, and its expanded table takes in `'Domain'`, so the domain filter went too. The rule now: never remove filters from a whole dimension table; remove the column you mean, as in `REMOVEFILTERS ( 'Metric'[MetricKey], 'Metric'[MetricName] )`. The lint fails on `REMOVEFILTERS`, `ALL` or `ALLNOBLANKROW` over a whole `'Metric'`, `'Domain'`, `'Team'` or `'Lab'`, except `ALLNOBLANKROW ( 'Domain' )` in the MovementStep table. `'Quarter'` has no table beyond it, so it keeps the table form.
- Deneb visuals sat inside Power BI's own titled, padded white card. Every Deneb visual now writes `visualContainerObjects` with `title.show` false, `subTitle.show` false, `background.show` false and `transparency` 100, `border.show` false, `padding` `top`, `bottom`, `left` and `right` at 0, and `dropShadow.show` false. Native visuals keep the themed card. Templates without a title of their own now show none.
- Deneb blocks were shorter than their specs. The hero, domain cards and KPI tiles now take their height from the spec's `meta.json` (220, 314 and 180), and the rows below move down: the Overview heat and actions row gives up 30px, and on domain pages the middle row gives up 46px. `npm run deneb:layout` fails if any of these is shorter than its spec, if blocks overlap, or if a block runs into the footer. The domain cards spec derives its row height from the container, `(height − 12) / 2`.
- Headlines and read-outs were placeholder text. Each is now a Card (new), `cardVisual`, bound to its measure: `label.show` false, and `value` with `fontFamily`, `fontSize` (16.5pt for headlines, 11.25pt for read-outs), `fontColor` ink, `bold` false and `horizontalAlignment` left, both with selector `{ "id": "default" }`; `fillCustom.show` and `outline.show` false for the card's own fill and border. A card rather than a text box with a dynamic value, because the card is the only generated visual that shows a text measure and follows the filters without hand work. The read-out is a "READ-OUT" kicker text box above three cards, one per measure.
- The footer's right-hand text wrapped. It now reads "Readiness: Live, Partial, Aspirational".
- Table headers read `DomainName`, `TeamName`, `Description`. Every native table projection now carries `displayName` from the manifest field name, and tables holding `Action[Description]` turn on `values.wordWrap`, except where the build notes ask for wrap off.

The third open (29 September 2026) drew every page. Four faults showed in the Deneb visuals, all now fixed in the specs:

- actions-timeline read "data refreshed 1 January 1970", its axis ran "11 Jan" to "19 Apr" and every dot sat on one date. The spec now reads `due` with `toDate`, which takes a JS Date, an epoch number or ISO text, and formats every date with `timeFormat` in local time rather than `utcFormat`. The axis end comes from the latest `due`, and `daysFromRefresh` is read with `toNumber`. A refresh of exactly 1 January 1970 is what the spec draws when `due` arrives empty, since `toDate` of an empty value is time 0. If it recurs, check the `due` field is bound and named `due`.
- bump-rank drew its points but no lines, and the x labels ran together as "Q2 2025Q3 2025". The one-line subtitle was wider than the 520px visual, so Vega's fit sizing shrank the plot to 60px and the dots covered the lines. The subtitle is now two lines. The x axis shows short labels such as "Q2 25". `quarter` and `rank` are read with `toNumber`, the lines carry an explicit `detail` on team and `order` on quarter, and the title counts quarters from the axis rather than from the `quarter` range.
- Visuals that draw no title of their own showed none once container titles were turned off. domain-cards, heat-matrix and kpi-tiles now carry a small mono kicker, top left, from a `title` param ("DOMAINS", "HEAT BY LAB", "METRICS"). heat-matrix's threshold line moves from under the grid to the kicker's subtitle. The domain cards spec is now 342px high (was 314), so the cards keep their size under the kicker.
- The four native lab cards on the Labs page could not draw the app's card. They are replaced by one Deneb visual, lab-cards (below).

Power BI delivers rows in no set order, so no spec depends on row order any more. Specs that placed items in arrival order now sort by an order param with a name fallback: `domainOrder` in domain-cards, dumbbell-movement and readiness-matrix, `metricOrder` in kpi-tiles, `rowOrder` in heat-matrix, `labOrder` in lab-sparkline-grid and lab-cards. bar-list breaks score ties by team name. composite-waterfall no longer puts the next step's label into the x domain, which had let row order set the bar order. `npm run deneb:validate` now checks this (see Regenerate samples and validate).

The fourth open (29 September 2026) showed rows multiplying. The Actions timeline subtitle read "14352 open actions" and the Overview actions table ran to the same length: 23 actions x 12 teams x 4 labs x 13 domains. The Movement by team table listed every team against every lab, with 0 in the measures. Domain, Team and Lab names were bound from their own tables beside Action or Team rows, and the measures returned 0 (`+ 0`, `IF ( ..., 0 )`) instead of blank, so Power BI kept every combination. Now:

- Five calculated columns carry names onto the row table: Action[DomainName], Action[TeamName], Action[LabName], Team[LabName] and Metric[DomainName] (`model/README.md`, Calculated columns). `export-pbip.ts` writes them into the TMDL.
- Blocks whose rows are actions (the Overview and domain-page actions tables, Actions by domain, actions-timeline) take their names from Action. Blocks whose rows are teams (the Labs matrix, Movement by team, bar-list, bump-rank, maturity-ladder, and lab-sparkline-grid's `lab`) take Lab from Team[LabName]. Blocks whose rows are metrics (the lineage table and readiness-matrix) take Domain from Metric. actions-timeline binds `due` to the date column Action[DueDate]; the Due ISO build measure is gone.
- The blank rule: a measure returns blank when its base table has no rows in context. Every `+ 0` and zero fallback is gone from the measures, except inside text measures (names ending Headline, Read Out, Display or Formatted), which coalesce their counts so the sentence reads "0 past due". The hero and lab cards show 0 through Display build measures, such as `[Teams Healthy Display]`, bound only there. `npm run deneb:pbip` fails on `+ 0` or `COALESCE (` in any other measure.
- `npm run deneb:layout` runs a single-table check: every Deneb block's row columns come from one table (Action, Team, Metric, Domain, Lab or MovementStep), including that table's name columns. Grids that cross a second axis on purpose are declared in `GRID_AXES`: heat-matrix (lab by domain), lab-sparkline-grid (lab by domain by quarter), bump-rank and trend-target (by quarter) and maturity-ladder (team by capability). Every cell of those grids is real, and their measures are blank elsewhere.

Desktop still has to confirm the Card (new) object and property names above (`fillCustom`, `outline` and `horizontalAlignment` are the least certain) and that a text measure fits its card at these heights. It also has to confirm that the calculated columns load, that `RELATED ( 'Lab'[LabName] )` on Action resolves through Team, and that the Actions timeline now reads 23 open actions.

The fifth open (29 September 2026) showed four presentation faults, now addressed in the generator:

- Native visuals had no white card. Every native visual now writes its `visualContainerObjects` in full rather than relying on the theme's `visualStyles`: blocks that sit in a card in the app (tables, the matrix, the Sources tiles, the read-out frame and Ingestion patterns) get `background` show true, colour surface, `transparency` 0; `border` show true, colour line, `radius` 18; `padding` 18 and 20; `dropShadow` show false. Header and footer text (kicker, title, headline, note, footer) sits on the paper in the app, so it gets `background` show false with `transparency` 100 and `border` show false, written out just the same. Deneb visuals keep the transparent, borderless container. `npm run deneb:pbip` fails if any visual lacks explicit `background` and `border` objects, or a Deneb visual shows either. `report.json` now also names a base theme under the custom one: `themeCollection.baseTheme` `{ "name": "CY24SU10", "reportVersionAtImport": "5.61", "type": "SharedResources" }`. That shape is untested, and no SharedResources package or file is written with it.
- Headline cards, text boxes and tables showed scroll bars. Every text size is now the app's px times 0.75 exactly (a 24px headline is 18pt, 15px read-outs 11.25pt, 13px table values 9.75pt). Header boxes are taller than the app's lines: kicker 24px, title 60px, headline 40px (64px for two lines), note 24px, so the body starts 10px lower. Card (new) values carry `wordWrap` true; the domain page question note is now a text card too, not a classic card at its default 30pt. `npm run deneb:pbip` fails if a text box or text card needs more height than its block has: points x 1.333 x lines must not exceed the height less the vertical padding. Tables now set `values.fontSize` 9.75, `columnHeaders.fontSize` 8.25 in the mono face, `grid.rowPadding` 2 with horizontal rules only, and each table block is sized for its expected rows at 22px under a 26px header: Labs matrix and Movement by team one row per team, Actions by domain one per domain with actions, domain-page actions and sources the largest domain's count, all counted from the model CSVs by `npm run deneb:layout`. The Lineage table (every metric) and the Overview actions table (every action, in a 210px row) keep their scroll bars by design.
- The footer's readiness legend was plain text. It is now the readiness-legend Deneb visual (below), 420 by 36 at the footer's right on every page; the footer text box keeps only the left text.
- Some tables showed the wrong rows or values. The Labs matrix now has Team[TeamName] as its only row field, Domain[DomainName] as columns and [Team Domain Score] as values, with `subTotals.rowSubtotals` and `subTotals.columnSubtotals` false, and a conditional `values.backColor` whose `Conditional` cases give good-fill at 80 and above, warn-fill at 60 and above and bad-fill below 60, selected by `dataViewWildcard` on the measure; values are ink. Tables set `total.totals` false. Action tables show Status from the calculated column Action[Status] ("Act", "Watch") rather than the severity key, and Due in the column's format, now `d mmm yyyy` on every date column. Sources and Lineage show Readiness from Metric[ReadinessWord] ("Live", "Partial", "Aspirational"). Movement by team already showed [Band Movement] as text.

Lab chips. heat-matrix, lab-cards, bar-list, bump-rank, maturity-ladder, lab-sparkline-grid and actions-timeline draw each lab as a two-letter chip: a 22 by 18 rounded rectangle in the lab colour with the code in white mono. They read the optional fields `labCode` and `labColour`, bound from Lab[LabCode] and Lab[LabColour], or from the calculated columns Team[LabCode], Team[LabColour], Action[LabCode] and Action[LabColour] that `export-pbip.ts` adds when Lab.csv carries those columns. Unbound, the chip shows the first two letters of the lab name on muted. Each spec's `meta.json` lists the two under `optional`, so `npm run deneb:validate` and `npm run deneb:layout` accept them missing. The lab cards carry the chip beside each lab name, so the Labs page row doubles as the lab legend.

New domains and labs. Incidents and Problems join the core domains after Stability, so the report has twenty pages and fifteen domain pages. Every `domainOrder` param now follows the app: stability, incidents, problems, maturity, architecture, risk, security, resilience, change, estate, governance, delivery, people, then cost and operability. heat-matrix and lab-sparkline-grid list the thirteen core domains. The labs are 24*7 Services, Colleague Tooling, Agentic Operations and Data & Insights, in that order. lab-cards sorts by an optional `labOrder` field (Lab[SortOrder]) when it is bound, and otherwise by its `labOrder` param of lab keys; lab-sparkline-grid sorts by lab name in the same order. domain-cards takes its column count from the number of domains, two rows, so fifteen cards sit eight across at about 221px, and the driver line truncates with an ellipsis at the card width. The PNGs in `preview/png/` predate these changes; the SVGs are current.

Desktop has to confirm: that the base theme loads without a SharedResources file; the table property names (`values.fontSize`, `fontColorPrimary`, `backColorPrimary`, `columnHeaders`, `rowHeaders`, `grid.rowPadding`, `gridHorizontalColor`, `total.totals`, `subTotals`); the matrix conditional formatting shape; `value.wordWrap` on Card (new) and `labels` and `wordWrap` on the classic card; that 22px rows hold at 9.75pt; and that the readiness legend renders with its one bound measure.

**Checking the Deneb GUID.** The script writes every Deneb visual with the `DENEB_VISUAL_GUID` constant at the top of `scripts/export-pbip.ts`, `deneb7E15AEF80B9E4D4F8E12924291ECE89A`, which is believed to be Deneb's AppSource GUID. To confirm it, add one Deneb visual to any page in Desktop, save, and open the new folder under `PlatformHealth.Report/definition/pages/<page>/visuals/`. Its `visual.json` holds the GUID in `visual.visualType`, and `definition/report.json` lists it under `publicCustomVisuals`. If it differs, change the constant and run `npm run deneb:pbip` again.

**What to expect.**

- Every page laid out as in the mock, on the paper background, with the theme applied.
- Deneb visuals render once their fields resolve after the first refresh. Each carries its template's spec with the placeholders already swapped for the model field names, plus `deneb/config.json`, so no import dialog is needed.
- Headlines, notes and read-outs are Card (new) visuals bound to their measures, so they follow the filters. The footer's refresh date is static text from `Config.csv`; the readiness pills beside it are a Deneb visual.
- Lab cards are the lab-cards Deneb visual; single-value cards use the classic card with its category label off. The Labs matrix band colours and table totals are generated; the other conditional formatting and sort orders in the build guide notes are not: apply them by hand.
- The Ingestion patterns text box holds all five patterns as one list, sized for its six lines. Split it into five text boxes as the build guide describes if you want the app's columns.

**Untested assumptions.** Each was written from documentation and past files, not from a round trip through Desktop. If Desktop objects, the file to edit is `scripts/export-pbip.ts` in every case; the place within it is given.

| Assumption | Where to fix |
| --- | --- |
| Schema URLs and versions: PBIR report, page, visual container, pages and version metadata at 1.0.0; definition.pbir at 2.0.0 with version 4.0; definition.pbism 1.0.0 with version 4.0; `.platform` 2.0.0; version.json `2.0.0` | `SCHEMA` and `FORMAT` constants at the top |
| Deneb's visual GUID, data role `dataset` and format object `vega` with `provider`, `jsonSpec`, `jsonConfig`, `renderMode`, `isNewDialogOpen` and the four interactivity switches as string or boolean literals | `DENEB_VISUAL_GUID`, `DENEB_ROLE`, `DENEB_OBJECT`, and `denebVisual` |
| Deneb names each dataset field by the field's display name (column name, measure name, or "Count of MetricKey" for an aggregated column), so the substituted specs read those names | `denebVisual` and `AGG` |
| Text boxes hold `paragraphs` as plain JSON under `objects.general`, not as expressions. Dynamic values in text boxes are not generated | `paragraphsJson` and `textboxParagraphs` |
| Visual role names: `Values` for tableEx, card and slicer; `Rows`, `Columns`, `Values` for pivotTable; `Data` for cardVisual | `visualJson` |
| Aggregate function numbers: First as Min (3), Count as CountNonNull (5), Count (Distinct) as Count (2) | `AGG` |
| Visual container objects `title`, `background` (with `transparency`), `border` (with `radius`), `padding` and `dropShadow` written on every visual; for Deneb also `subTitle` | `containerObjects` and `denebContainerObjects` |
| Card (new) objects `label`, `value`, `fillCustom` and `outline` with selector `{ "id": "default" }`, and `value.horizontalAlignment` and `value.wordWrap`; classic card `labels` and `wordWrap` | `textCardObjects`, and `visualJson`, card branch |
| Table projections accept `displayName`; table objects `values` (`fontSize`, `fontFamily`, `fontColorPrimary`, `backColorPrimary`, `wordWrap`), `columnHeaders`, `rowHeaders`, `grid` (`rowPadding`, `gridHorizontal`, `gridHorizontalColor`), `total.totals` and `subTotals` (`rowSubtotals`, `columnSubtotals`) | `tableObjects` |
| Matrix conditional formatting as `values.backColor` with a `Conditional` of `Cases` (`Comparison` kind 2 for at least, 3 for below) and a `dataViewWildcard` selector on the measure's query ref | `tableObjects`, `BAND_RULES` |
| `themeCollection.baseTheme` `CY24SU10` with type `SharedResources` and no SharedResources package or file; if Desktop objects, remove it or add the package Desktop writes | `FORMAT.baseTheme` and the `report.json` block in the Write section |
| TMDL: database compatibility level 1567, top-level `annotation` lines in model.tmdl, measure expressions indented three tabs, a hidden `Placeholder` column making `_Measures` a measure table, calculated Period columns with `isNameInferred` | `FORMAT.compatibilityLevel`, `tableTmdl`, `measureTmdl`, `measuresTableTmdl` |
| Visual and filter names: visual folders take the manifest id with dots as underscores; filter names are 20-character hashes | `visualJson` call in the Write section and `filterJson` |
| The MovementStep calculated table, pasted from the comment in `model/measures.dax`, evaluates with no relationship to Domain and reads `ALLNOBLANKROW ( Domain )` | `commentedTableDax` and the MovementStep `tables.push` |
| Deneb's `vega` object loads without a `providerVersion` property | `denebVisual` |
| `CsvFolder` defaults to the placeholder `C:\PlatformHealth\model\csv`, which will not exist; `powerbi/local.json` overrides it, or set it in Desktop before the first refresh | `CSV_FOLDER` constant under Paths, or `powerbi/local.json` |

## Apply the theme

1. Set the report page size to Custom, 1920 by 1080. The theme's font sizes assume it.
2. In Power BI Desktop, open View, then Themes, then Browse for themes.
3. Choose `theme/platform-health.theme.json`.

Visuals get a white background, a pale grey border with an 18px radius, no shadow and no visual header. Titles use Georgia; body text uses Segoe UI. The filter pane uses the pale sage panel.

The theme is the Power BI counterpart of the light token block in `src/styles.css` (`:root`). Every colour in it is copied from that block and must be kept in step with it. Font sizes are the app's `theme.ts` type sizes (px on a 1920x1080 canvas) converted to points at 0.75, for a report page set to 1920x1080. The theme file carries no comment of its own, because the report theme schema does not allow one.

## Headlines and narrative

Words for movement. A change in a domain or team health score always reads "better", "worse" or "held" after the signed value, never "up", "down" or "flat": "−3 worse", "+2 better", "0 held". Colour follows the word: worse amber, better emerald, held muted. Charts of score change carry the line "Change in health score, 0 to 100. Up is better." Metric deltas on KPI tiles keep their arrow and direction-aware colour and add "better" or "worse" after the value, since for a metric such as open incidents a fall is the improvement.


Every headline and read-out in the mock is a fixed rule applied to data, not authored text, so each
maps onto a DAX text measure or a Smart Narrative visual rather than a text box. The domain headline
is `[Domain Headline]` in `model/measures.dax`; the other pages' headlines and read-outs sit beside it.

`[Domain Headline]` names the domain's score and band, then the metric furthest from target and the
closest or best one. It carries the app's branches for no scored metric and every metric at target.

Bind the measure to the page-text block's `headline` field; never hard-code the
sentence, so it recomputes for whichever domain, lab or team the report is filtered to.

## Containers, footer and rendering mode

Container rule. Every spec's `meta.json` names its container. `"card"` specs sit in a Power BI card: white background, theme line border, radius 18, padding 20, shadow off, title off. The spec draws its own title and no outer card of its own. `"bare"` specs get a transparent container with no border and padding 0, and draw everything themselves. The bare specs are page-text, lab-legend, readiness-legend, page-footer, overview-hero, domain-cards, kpi-tiles and lab-cards; every other spec is a card. `npm run deneb:pbip` fails if a visual's container objects differ from its meta.

Footer rule. Every page ends in one page-footer visual, 1824 by 36, in place of a text box. The left reads [Page Footer Left], "Platform Health · report · page". The right reads [Page Sources Refreshed]: the source systems behind the page's metrics (the page's domain, or every core domain on other pages), most recently refreshed first, five then "+N more", each as "today 06:00", "yesterday 18:00" or "30 Jun" against Config[RefreshDate]. Refresh times come from the SourceRefresh table, which `export-model.ts` writes from the app's `src/data/sourceRefresh.ts`. Every visual in the report is Deneb, and `npm run deneb:pbip` fails otherwise. The readiness legend sits only on the Lineage page, top right.

Rendering mode. Every Deneb visual renders to canvas. One constant, `RENDER_MODE` in `scripts/export-pbip.ts`, sets it for the whole report; setting it to `'svg'` reverts every visual in one line. Each visual can also be switched on its own in Deneb's format pane, under Rendering, Render mode.

## Add a Deneb visual

Importing a template is quicker; see Templates below. To paste a spec by hand instead:

1. Get Deneb from AppSource if the report does not have it yet, and add it to the page.
2. Drag the fields the spec expects (see the visual's section below) into the visual's Values well. Rename them in the well so the names match exactly.
3. Open the visual's editor and choose Vega-Lite as the provider, starting from an empty spec.
4. Paste the contents of the spec file into the Specification pane.
5. Paste the contents of `deneb/config.json` into the Config pane.
6. Apply, then close the editor.

Every spec reads `"data": {"name": "dataset"}`, which is the name Deneb gives the fields in the Values well. Every spec sizes itself to the visual with `"width": "container"` and `"height": "container"`, so resize the visual rather than the spec.

Every spec opens its `params` with the same thirteen colour params, listed in `deneb/config.md`. If you change a colour, change it in that block in every spec. Params that set layout for one visual, such as `labelWidth`, follow after the shared block.

Ten visuals cross-filter the page when clicked, and every visual carries tooltips. Both need switches in the visual's format pane; see Interactivity and theme below.

## Templates

Each spec is also written as a Deneb template in `deneb/templates/`. A template is the spec with a `usermeta` block that carries the shared config, the interactivity settings and a list of the dataset fields it reads. Every field name in the spec is swapped for a placeholder, `__0__`, `__1__` and so on, so Deneb asks you which field fills each one.

The templates follow Deneb's template metadata version 1 (`metaVersion: 1`, provider `vegaLite`, `providerVersion` the Vega-Lite major and minor version in `package.json`), as used by Deneb 1.6 and 1.7 for Power BI, and are stamped with build 1.7.0.0. They have not been test-imported into a live Deneb from here; the validator checks that each one renders once its placeholders are mapped back.

To use one:

1. Put the fields the template needs into a new Deneb visual's Values well. `deneb/templates/INDEX.md` lists them per template, with the DAX measure or column that feeds each.
2. Open the visual's editor. Deneb offers to create a spec; choose Import, then pick the `.deneb.json` file.
3. Map each placeholder to its field. The dialog shows each placeholder's description, type and whether it expects a column or a measure. `due` in actions-timeline is typed as a date; it is fed by the date column Action[DueDate]. The spec reads it with `toDate`, so ISO text works as well.
4. Create. The spec and config arrive together, so do not paste `deneb/config.json` as well.
5. In the visual's format pane, under the Deneb settings, turn on Enable cross-filtering (for actions-timeline, bar-list, bump-rank, domain-cards, dumbbell-movement, heat-matrix, kpi-tiles, lab-sparkline-grid, maturity-ladder and readiness-matrix) and set its selection mode to Advanced, so the `__select__` params drive the selection. Turn on Enable tooltip handler. Every template carries `selectionMode: 'advanced'` in its interactivity settings, but set the mode in the format pane as well.

Fields are mapped by placeholder, so the names in the Values well need not match the sample names. Every expression uses bracket access, `datum['field name']`, so a mapped name may contain spaces.

Rebuild the templates with `npm run deneb:templates` after changing a spec, `deneb/config.json` or a field note in this README. The field descriptions come from the Dataset fields tables below. The measure or column for each field in `INDEX.md` comes from `BINDINGS` in `scripts/build-templates.ts`, which follows `layout/manifest.json`; the build fails if a measure is not in `model/measures.dax` or a column is not in the model.

## Interactivity and theme

**Clicks.** With Enable cross-filtering on, Deneb adds `__selected__` to each row: `on`, `off` or `neutral`. Ten specs declare a point selection named `__select__` (`select: {type: "point", on: "click", clear: "dblclick"}`), which Deneb passes to the Power BI selection manager. This needs the visual's cross-filtering selection mode set to Advanced; in Simple mode Deneb resolves clicks itself rather than through the spec's `__select__` param. A click selects, a double click clears.

| Visual | Click selects | Selection fields |
| --- | --- | --- |
| bar-list | A team's row | `team` |
| heat-matrix | One lab and domain cell | `row`, `domainId` |
| domain-cards | A domain card | `domainId` |
| kpi-tiles | A metric tile | `metricId` |
| maturity-ladder | A team, across all five capabilities | `team` |
| dumbbell-movement | A domain's row | `domainId` |
| bump-rank | A team, across every quarter shown | `team` |
| lab-sparkline-grid | One lab and domain cell | `lab`, `domainId` |
| actions-timeline | One action | `actionId` |
| readiness-matrix | One domain and mode cell | `domainId`, `mode` |

overview-hero, trend-target and composite-waterfall have no selection; each shows one scope or domain, and the page filters drive them. A waterfall step is a computed contribution, not a row in the model, so there is nothing for it to select.

**Selection feedback.** Rows whose `__selected__` is `off` drop to 35% opacity; `on` and `neutral` rows stay at full strength, so state is shown by strength as well as by the Power BI cross-filter, never by colour alone. The opacity is a condition on `datum.__selected__`. Where a mark already uses opacity for data, the two combine: proposed domain cards sit at half strength or 35% when unselected, and maturity pips multiply their partial fill by 0.35. Without cross-filtering `__selected__` is absent and everything draws at full strength.

**Tooltips.** Every mark that stands for a row has a `tooltip` encoding with the row's key fields and its formatted values. With Enable tooltip handler on, Deneb shows them as Power BI tooltips; with it off, they are not shown as Power BI tooltips.

**Theme colours.** The shared colour params take seven colours from the report theme through Deneb's `pbiColor(index)`, which returns the theme's `dataColors` entry at that zero-based index. The mapping is `evergreen` and `ink` 0, `emerald` 1, `amber` 3, `red` 4, `muted` 6 and `line` 8, against the order in `theme/platform-health.theme.json`. `sage`, `surface`, `cream` and the three band fills have no theme counterpart and stay literal. The table is in `deneb/config.md`. With the Platform Health theme applied, the visuals look exactly as the previews; with another theme, the evergreen, emerald, amber, red, muted and line colours follow it.

**Number formats.** kpi-tiles formats its progress percentage with `pbiFormat(progress, '0%')` and a pound delta with `pbiFormat(delta, '£#,0')`, so they follow Power BI's format rules. Other deltas keep Vega's `format`, because the Power BI format string for a percentage-point change would change the text.

**Node stand-ins.** Vega rejects an unknown function when it parses a spec, and an expression cannot test whether a function exists. So the specs call `pbiColor` and `pbiFormat` directly, and the validator registers stand-ins with `vega.expressionFunction` before rendering. `pbiColor` returns the theme file's `dataColors` entry, or a named theme colour. `pbiFormat` applies the two format strings above and fails the render on any other, so a new format string needs a stand-in rule. `pbiPatternSVG` returns its foreground colour. Previews therefore match what Deneb draws with the Platform Health theme. The same calls mean the specs no longer render in the plain Vega editor.

## The visuals

Sizes below are for a 1920 by 1080 page and match the preview sizes in each `.meta.json`.

### overview-hero: composite health band

**Purpose.** The hero band at the top of the Overview page. On the left is the kicker Composite health, then the composite score in 96px serif with its band pill directly beneath. To the right of the score is a six-quarter sparkline of the composite: a pale emerald area, an evergreen line and an end dot in the band colour, with "{q1} to {q6} over six quarters" beside the pill. The sparkline's vertical range is at least 10 points, so a small wobble does not read as a cliff. On the right is the Overview headline on two lines, then the Domain mix row. That row is one full-width stacked bar of core domains by band. Each segment has its pale band fill, a band-colour stroke and a dot, and is labelled "{n} healthy", "{n} to watch" or "{n} to act". A band with no domains draws no segment.

The spec reads one row per scope, already aggregated, and applies the app's Overview rule: "{n} of {N} domains healthy across {scope}." then "{k} teams need action, led by {worst domain}." When no team is in the Act band the second line reads "No team needs action; {worst domain} is the weakest domain." A scope of `Estate` reads as "the estate". The composite is the mean of team composites, as the app computes it, not the mean of domain scores. Its band is 80 and above Healthy, 60 and above Watch, otherwise Act.

**Dataset fields.**

| Field | Type | Notes |
| --- | --- | --- |
| `scope` | text | `Estate` or a lab name; filter the visual to one scope |
| `composite` | whole number | Mean of the composite scores of the teams in scope, rounded |
| `healthyDomains` | whole number | Core domains in the Healthy band for the scope |
| `watchDomains` | whole number | Core domains in the Watch band |
| `actDomains` | whole number | Core domains in the Act band |
| `coreDomains` | whole number | Core domains in the model, 11 today; proposed domains are excluded |
| `teamsNeedingAction` | whole number | Teams in scope whose composite is in the Act band |
| `worstDomain` | text | Name of the lowest-scoring core domain for the scope |
| `q1` to `q6` | whole number | Composite for each of the last six quarters, oldest first; `q6` equals `composite`. Each is the mean of team composites at that quarter |

The sample is `deneb/samples/hero.json`, one row for the estate and one for each lab.

**DAX suggestions.**

```
Composite = ROUND ( AVERAGEX ( VALUES ( Team[TeamId] ), [Team Composite] ), 0 )

Healthy Domains =
COUNTROWS ( FILTER ( VALUES ( Domain[DomainId] ), NOT Domain[Proposed] && [Domain Score] >= 80 ) )

Teams Needing Action =
COUNTROWS ( FILTER ( VALUES ( Team[TeamId] ), [Team Composite] < 60 ) )

Worst Domain =
MAXX ( TOPN ( 1, FILTER ( VALUES ( Domain[Name] ), NOT Domain[Proposed] ), [Domain Score], ASC ), Domain[Name] )
```

`watchDomains` and `actDomains` follow `Healthy Domains` with the band test changed. `coreDomains` counts domains where `Proposed` is false. `q1` to `q6` are `Composite` shifted back with `DATEADD ( 'Date'[Date], -5, QUARTER )` for `q1`, stepping to `0` for `q6`.

**Page sizing.** 1824 by 220, across the full width under the page header. The score block, sparkline included, is fixed at 440px (the `scoreWidth` param). The Domain mix bar takes the rest. Every segment present gets at least 170px (`minSegment`) so its label always fits. The remaining width is shared in proportion to the counts, and segments sit 6px apart (`segmentGap`).

**Notes.** Filter the visual to a single scope. The headline sits on two lines above the Domain mix bar; below about 1200px wide a line is cut short with an ellipsis.

### domain-cards: domain grid

**Purpose.** The Overview grid of domain cards, two rows, with the column count taken from the number of domains (eight across for fifteen). Each card shows the domain name, the score, a band pill, the change since last quarter, the weakest driver against its target with units, and a sparkline of the last six quarters. The change reads "+n vs last quarter", from `q6` minus `q5`. It is emerald when the score rose, amber when it fell and muted at zero. The sparkline is a 1.5px evergreen line over a pale emerald area, with an end dot in the band colour. Behind it, a faint sage band marks 80 to 100, so the healthy line is always in view. All cards share one vertical scale, so sparklines compare across cards. Proposed domains carry a Proposed kicker and are drawn at half strength.

**Dataset fields.**

| Field | Type | Notes |
| --- | --- | --- |
| `domainId` | text | Unique per card |
| `domain` | text | Domain name, shown in the serif face |
| `proposed` | true/false | True shows the Proposed kicker |
| `score` | whole number | Current domain score out of 100 |
| `band` | text | `healthy`, `watch`, `act` or `context` |
| `driverLabel` | text | Short name of the weakest scored metric |
| `driverValue` | decimal number | Its current value |
| `driverTarget` | decimal number | Its target |
| `driverValueFormatted` | text | `driverValue` with its unit, formatted as `formatted` is in kpi-tiles, for example "14.3%" |
| `driverTargetFormatted` | text | `driverTarget` formatted the same way, for example "10%" |
| `q1` to `q6` | whole number | Domain score for each of the last six quarters, oldest first |

**DAX suggestions.**

- `score`: `ROUND ( AVERAGEX ( VALUES ( Team[TeamId] ), [Domain Score] ), 0 )`.
- `q1` to `q6`: `CALCULATE ( [score], DATEADD ( 'Date'[Date], -5, QUARTER ) )` for `q1`, stepping to `0` for `q6`.
- `driverValue` and `driverTarget`: `MINX` over the domain's scored metrics to find the weakest, then return its value and target.
- `driverValueFormatted` and `driverTargetFormatted`: the same `FORMAT` rules as kpi-tiles' `formatted`, applied to the driver's value and target.

The driver line reads "{driverLabel} {driverValueFormatted} vs {driverTargetFormatted}".

**Page sizing.** 1824 by 342, the full content width of the Overview row, including the kicker. The change and driver lines are never cut short, so below about 1600px wide a long driver line can run past its card.

**Notes.** Cards fill the grid left to right in the order of the `domainOrder` param; a domain not in it goes last, by name. The kicker text is the `title` param, "DOMAINS" by default. The grid holds 14 cards; a fifteenth would be drawn off the bottom.

### heat-matrix: score by lab and domain

**Purpose.** Health score by lab and core domain, with each lab's composite in a final Composite column set apart by a small gap. Each cell has a pale band fill, a band-colour stripe on its left edge and always shows the score. A "HEAT BY LAB" kicker (the `title` param) heads the grid, and the subtitle beneath it states the thresholds, so colour is never the only signal.

Each lab needs one extra row with `domainId` `composite` and `domain` `Composite`. The spec always places it last.

**Dataset fields.**

| Field | Type | Notes |
| --- | --- | --- |
| `row` | text | Lab name; one grid row per lab, in the order of the `rowOrder` param, then by name |
| `rowType` | text | Filter the visual to `lab` |
| `domainId` | text | Sets column order; domains outside the thirteen core ones are dropped, except `composite` |
| `domain` | text | Column header; `Composite` on composite rows |
| `score` | whole number | Score out of 100 for that lab and domain; on composite rows, the mean of team composites for the lab |
| `band` | text | `healthy`, `watch` or `act`; sets the cell fill and stripe |

**DAX suggestions.**

- `score`: `ROUND ( [Domain Score], 0 )` evaluated per lab and domain.
- `band`: `SWITCH ( TRUE (), [score] >= 80, "healthy", [score] >= 60, "watch", "act" )`.
- Composite rows: `ROUND ( AVERAGEX ( VALUES ( Team[TeamId] ), [Team Composite] ), 0 )` per lab, appended in Power Query or a calculated table.

**Page sizing.** 1000 by 260 for four labs. Add about 50px of height for each extra lab.

**Notes.** Column order is fixed by the `domainOrder` param. Edit it there if domains change. The Composite column is offset by `compositeGap` (14px). The lab name column is 170px and names are never cut short, so keep lab names under about 170px.

### trend-target: score against target

**Purpose.** One domain's score over six quarters, drawn against the healthy band (80 to 100) and the watch line (60). The y axis runs from 40 to 100, and its title says so. Under the line, an area fades from emerald at 25% to nothing at the base. Every quarter's score is printed above its point in small mono. The latest score and its band word sit to the right of the last point, vertically centred on it, with a white halo so they stay legible over any band. The domain name becomes the chart title and the scope ("Estate" or the lab name) its subtitle. A legend row at the bottom right reads "Healthy 80 and above · Watch 60 to 79".

**Dataset fields.**

| Field | Type | Notes |
| --- | --- | --- |
| `domain` | text | Domain name; the first row's value becomes the chart title |
| `domainId` | text | Filter the visual to one domain |
| `quarter` | whole number | 1 to 6, oldest first; sorts the x axis |
| `quarterLabel` | text | For example "Q3 2026"; shown on the x axis |
| `score` | whole number | Domain score out of 100 for that quarter |
| `target` | whole number | 80 on every row; the chart draws its band from fixed values |
| `scope` | text | "Estate" or a lab name; filter the visual to one scope. The first row's value becomes the subtitle |

**DAX suggestions.**

- `score`: `ROUND ( [Domain Score], 0 )` with the quarter on rows.
- `quarter`: a rank over the last six quarters, for example `RANKX ( ALLSELECTED ( 'Date'[Quarter] ), 'Date'[QuarterStart], , ASC )`.

**Page sizing.** 800 by 360, beside the heat matrix. The last 237px on the right (the `endLabelWidth` param, computed to fit "100 · Healthy" at the label's 26px font) is kept clear for the end label. The score axis starts at 40, or lower when a score falls below 40: the floor drops to the multiple of ten at or below the lowest score, as the app does.

**Notes.** Filter the visual to a single domain and a single scope, through page filters, slicers or the visual's own filters. It expects six rows.

### kpi-tiles: metric tiles

**Purpose.** A row of KPI tiles for one domain. Each tile shows the metric kicker, the band pill, the formatted value with a progress bar beneath it, a six-quarter sparkline on the right, the change over the period and the target. It matches `KpiTile` in the app.

The change carries an arrow: ▲ when the value rose, ▼ when it fell. It is emerald when the move is in the metric's good direction, amber when it goes the wrong way, and muted at zero. A falling value is good for a `lower` metric and bad for a `higher` one.

The progress bar shows how close the value is to target. It sits on a sage track, is filled in the band colour, and has its percentage printed after it. The rule:

- `higher` metrics: value divided by target.
- `lower` metrics: target divided by value, so a value twice the target fills half the bar.
- Either way the bar is capped at 100%, so a value at or better than target fills it.
- A `lower` metric with a target of 0 shows an empty bar until the value reaches 0. A `higher` metric with a target of 0 is always full.

The sparkline scales each metric to its own six-quarter range, so it shows shape rather than size. It ends in a dot in the band colour.

**Dataset fields.**

| Field | Type | Notes |
| --- | --- | --- |
| `domainId` | text | Filter the visual to one domain |
| `metricId` | text | Unique per tile |
| `label` | text | Shown in capitals as the tile kicker |
| `formatted` | text | The value exactly as it should read, for example "86.8%" |
| `unit` | text | `count`, `pct`, `days`, `level`, `perMonth` or `gbp`; sets the suffix on delta and target |
| `target` | decimal number | Target in the metric's own unit |
| `delta` | decimal number | Change over the period (last quarter minus the first quarter of the six shown); the spec adds the sign |
| `band` | text | `healthy`, `watch`, `act` or `context`; sets the pill, the progress fill and the sparkline end dot |
| `value` | decimal number | The unformatted value; drives the progress bar |
| `direction` | text | `lower` or `higher`: which way is better. Colours the change and sets the progress rule |
| `targetFormatted` | text | The target exactly as it should read, formatted as `formatted` is, for example "95%" |
| `q1` to `q6` | decimal number | Metric value for each of the last six quarters, oldest first; `q6` equals `value` |

**DAX suggestions.**

- `formatted`: `FORMAT ( [Metric Value], "0.0" ) & "%"` for percentages, `FORMAT ( [Metric Value], "#,0" )` for counts.
- `delta`: `[Metric Value] - CALCULATE ( [Metric Value], DATEADD ( 'Date'[Date], -1, QUARTER ) )`.
- `target`: `SELECTEDVALUE ( Metric[Target] )`.
- `direction`: `SELECTEDVALUE ( Metric[Direction] )`.
- `q1` to `q6`: `CALCULATE ( [Metric Value], DATEADD ( 'Date'[Date], -5, QUARTER ) )` for `q1`, stepping to `0` for `q6`.
- `band`: a `SWITCH` on the metric score, 80 and above `healthy`, 60 and above `watch`, otherwise `act`; `context` for unscored metrics.

**Page sizing.** 1600 by 180 for three tiles. Allow about 260px per tile or the kicker is cut short; up to 1824 wide fits five.

**Notes.** Tiles are drawn in the order of the `metricOrder` param, one tile per row; a metric not in it goes last, by label. A "METRICS" kicker (the `title` param) sits above the tiles.

### bar-list: domain score by team

**Purpose.** One domain's score for every team, worst first. Each row has the team name with its lab beneath, a 12px bar on a 0 to 100 track, and the score and band word at the right. A dashed ink line marks the scope mean, which is the rounded mean of the rows shown, labelled "Scope mean {n}" at the top. Faint hairlines mark 60 and 80 behind the tracks. Bar colour follows the band: emerald for Healthy, amber for Watch, red for Act. The band word is always printed, so colour is never the only cue.

**Dataset fields.**

| Field | Type | Notes |
| --- | --- | --- |
| `domainId` | text | Filter the visual to one domain |
| `team` | text | One row per team |
| `lab` | text | Printed beneath the team name |
| `score` | whole number | Domain score out of 100; sorts the rows, lowest first |
| `band` | text | `healthy`, `watch` or `act` |

**DAX suggestions.**

```
Team Score = ROUND ( AVERAGE ( 'Domain Score'[Score] ), 0 )

Team Band =
VAR s = [Team Score]
RETURN SWITCH ( TRUE (), s >= 80, "healthy", s >= 60, "watch", "act" )
```

Put `team` and `lab` in the Values well as columns, then `Team Score` renamed to `score` and `Team Band` renamed to `band`.

**Page sizing.** 900 by 420 for twelve teams. Allow about 32px per team plus 60px for the title and the mean label. The label column is fixed at 220px and the value column at 110px (the `labelWidth` and `valueWidth` params).

**Notes.** Filter the visual to a single domain. Expect one row per team in scope.

For counts, such as the Actions page "Actions by domain", set the `unitLabel` param to a word such as `open`. Bind the domain name to `team` and the count to `score`; `lab` and `band` may be blank. The track then runs from 0 to the largest count, bars are evergreen, rows sort largest first, the value reads "3 open", and the reference lines, scope mean and band words are dropped. The chip is drawn only when a lab code or lab name is present. The title stays "Domain score by team"; set the block's `specTitle` in `export-layout.ts`, or edit the spec, for another use.

### maturity-ladder: maturity by capability

**Purpose.** A ladder for the Maturity domain. Each row is a team, grouped by lab with a hairline between labs. Each cell shows five pips filled up to the team's level for that capability, with the level printed beside them. A partial level fills the last pip by opacity, so 3.4 shows three full pips and a fourth at 40%. A 1.5px ink line after the fourth pip marks the target of 4. It stands 3px above and below the pips, in a wider gap, so it reads at a glance. Lab groups are shaded alternately in cream as well as divided by a hairline. Overall maturity sits last, set apart by a gap and a rule, with its pips in evergreen.

**Dataset fields.**

| Field | Type | Notes |
| --- | --- | --- |
| `team` | text | One row per team per capability |
| `lab` | text | Rows sort by lab, then team |
| `capability` | text | Must match one of the five column names exactly; other values are dropped |
| `level` | decimal number | 0 to 5, one decimal place |

**DAX suggestions.**

```
Capability Level = ROUND ( AVERAGE ( 'Maturity Assessment'[Level] ), 1 )
```

If overall maturity is not stored as its own capability row, add it in Power Query or with a calculated table that appends the mean of the four capability levels per team as `Overall maturity`.

**Page sizing.** 1200 by 520 for twelve teams. Allow about 36px per team plus 80px for the title and column headers. The team column is fixed at 200px (the `labelWidth` param); the five columns share the rest.

**Notes.** The five column names are the `capabilities` param: Triage and on-call, Incident management, Technical recovery, Resolution and problem management, and Overall maturity. The `target` param moves the target line and the wider gap with it. Expect five rows per team; no filter is needed.

### dumbbell-movement: what moved over the period

**Purpose.** Movement for each core domain from `from` to `to`, worst mover first. In the report `from` is the score at the start of the Period filter's window and `to` the score now, as the app's Movement page, the waterfall and the Movement by team table do. Each row has the domain name on the left, a muted hairline from the start score to the current one, a hollow dot at the start and a filled dot now. The filled dot is emerald when the score rose, amber when it fell and muted when it held. To the right of the line, the change and its word are printed in the same colour, for example "−3 worse", "+2 better" or "0 held", with a white halo so they stay legible over the hairlines. The axis runs from 40 to 100, with hairlines at 60 and 80 labelled Watch and Healthy. The subtitle has two lines: the period and scope, then "Change in health score, 0 to 100. Up is better."

**Dataset fields.**

| Field | Type | Notes |
| --- | --- | --- |
| `domainId` | text | One row per core domain; the selection key |
| `domain` | text | Domain name, printed on the left |
| `scope` | text | `Estate` or a lab name; filter the visual to one scope. The first row's value becomes the subtitle |
| `from` | whole number | Domain score at the start of the period; the sample uses last quarter (quarter 5 of 6) |
| `to` | whole number | Domain score now (quarter 6) |
| `delta` | whole number | `to` minus `from`; sorts the rows, lowest first, and sets the colour and the word |

The sample is `deneb/samples/movement.json`, one row per core domain for the estate and for each lab.

**DAX suggestions.**

- `to`: `ROUND ( [Domain Score], 0 )`.
- `from`: the Score Period Start build measure, [Score] at the first quarter of the Period window.
- `delta`: [Score Delta over Period].

**Page sizing.** 900 by 420 for thirteen domains. The label column is 170px and the change column 110px (the `labelWidth` and `valueWidth` params).

**Notes.** Filter the visual to a single scope. Scores below 40 are drawn at the axis edge.

### bump-rank: team ranking over the period

**Purpose.** Each team's rank by composite over the quarters in the data, rank 1 at the top. The title counts the quarters on the x axis, for example "Team ranking over six quarters". Every team is a line with a point at each quarter. This quarter's top three are drawn in evergreen and its bottom three in amber, at full strength and 3px wide. Their line ends carry the team name and current rank in bold, for example "Ledger · 11". The other teams are drawn in the line colour at full opacity and 2px wide, with their end labels in muted. The rank at each line end means the emphasis never relies on colour alone.

**Dataset fields.**

| Field | Type | Notes |
| --- | --- | --- |
| `team` | text | One line per team; the selection key |
| `lab` | text | Shown in the tooltip |
| `quarter` | whole number | 1 to 6, oldest first; sorts the x axis and orders each line. Read with `toNumber`, so text keys work |
| `quarterLabel` | text | For example "Q3 2026"; shown on the x axis as "Q3 26" and in full in the tooltip |
| `composite` | whole number | The team's composite at that quarter; shown in the tooltip |
| `rank` | whole number | 1 is the highest composite at that quarter; the sample breaks ties by team name |

The sample is `deneb/samples/rank.json`, twelve teams by six quarters.

**DAX suggestions.**

```
Team Rank =
RANKX ( ALLSELECTED ( Team[Name] ), [Team Composite], , DESC, Dense )
```

`Dense` gives tied teams the same rank; the sample breaks ties by name instead, so every rank is distinct.

**Page sizing.** 900 by 420 for twelve teams. The last 210px on the right (the `endLabelWidth` param) is kept clear for end labels. The `highlight` param sets how many teams are emphasised at each end. On the Labs and teams page the visual is 520px wide, wider than the app's 320px rail, so the plot keeps about 290px beside the labels.

**Notes.** Expect one row per team per quarter. The top and bottom groups are set by rank at the latest quarter.

### composite-waterfall: why the composite moved

**Purpose.** A waterfall from the composite at the start of the period to the composite now, with one step per core domain between them. Each step is that domain's score change over the period divided by the number of core domains, so the steps add up exactly to the change in the mean of domain scores. The start and end bars are evergreen; a step that raised the composite is emerald, one that lowered it amber, and a zero step muted. Dashed hairlines connect each bar to the next at the running total. Every bar carries its value with a sign, for example "+0.3" or "−1.8", so direction never relies on colour. The y axis fits itself around the values, with a margin, rather than running 0 to 100. The title is "Why the composite moved"; the subtitle names the scope and explains the steps, then reads "Change in health score, 0 to 100. Up is better." The tooltip adds "better", "worse" or "held" to each step.

**Dataset fields.**

| Field | Type | Notes |
| --- | --- | --- |
| `scope` | text | `Estate` or a lab name; filter the visual to one scope. The first row's value opens the subtitle |
| `step` | whole number | 0 for the start, 1 to n for the domains, n + 1 for the end; sorts the bars |
| `label` | text | "Six quarters ago", each core domain name, then "Now" |
| `kind` | text | `start`, `delta` or `end` |
| `value` | decimal number | On `start` and `end` rows the composite; on `delta` rows the contribution, the domain's change divided by the core domain count |
| `running` | decimal number | The composite after this step; equals `value` on `start` and `end` rows |
| `quarters` | whole number | Quarters in the period, the same on every row; the first row's value names the change in the subtitle, for example "six-quarter" |

The sample is `deneb/samples/waterfall.json`, fifteen rows for the estate and for each lab.

**DAX suggestions.**

- Build the steps in a calculated table or Power Query: one start row, one row per core domain, one end row. The model does this with the MovementStep table and the `[Step Value]` and `[Step Running]` measures (`model/README.md`, The MovementStep table; relationship MovementStep[DomainKey] to Domain[DomainKey], many to one, single direction).
- `value` on a domain row: `( [Domain Score] - CALCULATE ( [Domain Score], DATEADD ( 'Date'[Date], -5, QUARTER ) ) ) / [Core Domains]`.
- `running`: the start composite plus a running sum of `value` over `step`.
- `quarters`: [Selected Quarters].

**Page sizing.** 900 by 360 for thirteen domains. Labels of two or more words break onto two lines under the bars.

**Notes.** Filter the visual to a single scope. The composite here is the unrounded mean of domain scores. Its start can differ by under a point from the Overview's `q1`, which is the rounded mean of team composites; the end agrees with the Overview composite after rounding.

### lab-cards: one card per lab

**Purpose.** The Labs page's row of four lab cards, as `ph-lab-card` in the app. Each card shows the lab name in the serif face, the lead in muted, the composite score large in the serif face, a band pill (ink word, band-colour dot, pale band fill), and a line reading "{healthy} healthy · {watch} watch · {act} act" for its teams. On the right sits a six-quarter composite sparkline: an evergreen line over a pale emerald area, with an end dot in the band colour. All four sparklines share one vertical scale. Clicking a card selects its lab and cross-filters the page; the tooltip repeats the card.

**Dataset fields.**

| Field | Type | Notes |
| --- | --- | --- |
| `labId` | text | Lab key; sets the card order through the `labOrder` param and is the selection key |
| `lab` | text | Lab name |
| `lead` | text | Lab lead |
| `composite` | whole number | The lab composite, the mean of its team composites |
| `band` | text | `healthy`, `watch` or `act`; read in lower case, so [Band] works as well as [Band Key] |
| `healthyTeams` | whole number | Teams in the lab whose composite is Healthy |
| `watchTeams` | whole number | Teams whose composite is Watch |
| `actTeams` | whole number | Teams whose composite is Act |
| `q1` to `q6` | whole number | The lab composite for each of the last six quarters, oldest first |

Counts and quarters are read with `toNumber`, so text measures work. The sample is `deneb/samples/labcards.json`, four labs.

**Measures.** Every field has a measure in `model/measures.dax` or a Lab column: `labId` Lab[LabKey], `lab` Lab[LabName], `lead` Lab[Lead], `composite` [Composite], `band` [Band Key], `healthyTeams` [Teams Healthy Display], `watchTeams` [Teams Watch Display], `actTeams` [Teams Needing Action Display] (0 where a lab has teams in scope but none in that band), `q1` to `q5` [Score Q1] to [Score Q5] and `q6` [Composite]. With a lab in context and no domain, [Score] is the composite, so its shifted build measures give the composite trend.

**Page sizing.** 1824 by 170, the full content width of the Labs page. Cards are a quarter of the width less 16px gaps (the `cardGap` param).

**Notes.** With a lab chosen in the Lab filter, only that lab's card is drawn, in the first slot; the app keeps all four visible.

### lab-sparkline-grid: six-quarter trend by lab and domain

**Purpose.** Small multiples: one row per lab and one column per core domain, 44 cells for four labs. Each cell is tinted with the pale fill of its band this quarter. It shows the current score in the serif face, the band word in small mono and a six-quarter sparkline. The sparkline is an evergreen line over a pale emerald area, with an end dot in the band colour. All cells share one vertical scale, so slopes compare across the grid. The subtitle states the thresholds.

**Dataset fields.**

| Field | Type | Notes |
| --- | --- | --- |
| `lab` | text | One grid row per lab, in the order of the `labOrder` param, then by name; a selection key |
| `domainId` | text | Sets the column; domains outside the thirteen core ones are dropped. A selection key |
| `domain` | text | Column header |
| `quarter` | whole number | 1 to 6, oldest first |
| `score` | whole number | Score out of 100 for that lab, domain and quarter |
| `band` | text | `healthy`, `watch` or `act` for the latest quarter, on every row of the cell; sets the tint, the word and the end dot |

The sample is `deneb/samples/grid.json`, four labs by thirteen domains by six quarters.

**DAX suggestions.**

- `score`: `ROUND ( [Domain Score], 0 )` with lab, domain and quarter on rows.
- `band`: the heat-matrix band rule applied to the latest quarter's score, so every quarter of a cell carries this quarter's band.

**Page sizing.** 1400 by 360 for four labs. The lab column is 170px and the header 40px (the `labelWidth` and `headerHeight` params); cells share the rest. Add about 70px of height for each extra lab.

**Notes.** Column order is the `domainOrder` param, as in heat-matrix.

**Placement.** Spare: no page in `layout/manifest.json` uses it. The Labs and teams page has no 1400 by 360 space left once the lab cards, the Teams matrix and the movers visual are placed. It fits best on the Labs and teams page in place of the Teams matrix (about 1300 by 632 there), or on a page of its own. Its `band` must carry the latest quarter's band on every row; [Band Key] with a quarter in context gives that quarter's band, so it needs a variant fixed to the current quarter first.

### actions-timeline: when actions fall due

**Spare.** No page places this template since the Actions page became the table and the Actions by domain rail. It still builds and validates. Its best placement is a full-width band under the header of an actions-focused page, about 1824 by 400, or in place of the table on a page for one lab.

**Purpose.** Every open action on a date axis that runs from the refresh date to the latest due date. An ink line marks today, labelled with the refresh date, and the next 30 days are shaded sage and labelled Next 30 days. Act actions sit in a cream lane above Watch actions, and each lane is labelled with its name and count. Each action has its own line, sorted by due date within its lane. It has a dot at the due date, red for Act and amber for Watch, and a label reading "{team} · {description}", with the description cut to 42 characters (the `labelChars` param). Labels sit right of the dot, or left of it in the last 40% of the axis so they do not run off the edge. The tooltip carries the full description.

**Dataset fields.**

| Field | Type | Notes |
| --- | --- | --- |
| `actionId` | text | Unique per action; the selection key |
| `domain` | text | Shown in the tooltip |
| `team` | text | Opens the label |
| `lab` | text | Shown in the tooltip |
| `description` | text | Cut short in the label; in full in the tooltip |
| `due` | date or text | A date, or ISO text such as "2026-10-16"; read with `toDate` |
| `severity` | text | `act` or `watch`; sets the lane and the dot colour |
| `daysFromRefresh` | whole number | Days from the refresh date to `due`. The spec derives the refresh date from the first row, so it must be exact on every row, whatever order rows arrive in |

The sample is `deneb/samples/actions.json`, the mock's 23 actions against a refresh date of 28 September 2026.

**DAX suggestions.**

```
Days From Refresh = DATEDIFF ( MAX ( Config[RefreshDate] ), SELECTEDVALUE ( Action[Due] ), DAY )
```

Pass `due` as the date column or as text in ISO form, `FORMAT ( Action[Due], "yyyy-mm-dd" )`. Dates are shown in local time with `timeFormat`, so a Power BI date at local midnight keeps its day.

**Page sizing.** 1400 by 520 for 23 actions. Each action takes one line of about 17px, so allow 17px per action plus 130px for the title, axis and lane gap. The lane label column is 110px (the `laneWidth` param).

**Notes.** A 300px-high visual cannot hold 23 labelled actions without the labels overlapping, so each action has its own line. A past-due action would fall left of the today line, off the axis, so filter to actions due on or after the refresh date.

### readiness-matrix: where the data comes from

**Purpose.** For the Sources page: one row per domain, all fifteen, and one column per ingestion mode. Each cell with metrics shows a filled circle sized by the number of metrics in that domain and mode, the count beside it, and the readiness word. The circle is coloured by the least ready source among those metrics: emerald for live, amber for partial and muted for aspirational. The word says the same in small mono capitals, so readiness never relies on colour. Each row ends with a total such as "4 metrics · 2 live". Cells with no metrics are left empty.

**Dataset fields.**

| Field | Type | Notes |
| --- | --- | --- |
| `domainId` | text | A selection key; groups the row total |
| `domain` | text | Row label; rows follow the `domainOrder` param, then name |
| `mode` | text | `sql`, `semantic`, `spreadsheet`, `csv` or `api`; sets the column. A selection key |
| `modeLabel` | text | The mode's full name; shown in the tooltip. The column headers come from the `modeNames` param |
| `count` | whole number | Metrics in that domain and mode; sizes the circle |
| `worstReadiness` | text | `live`, `partial` or `aspirational`, the least ready among them |
| `live` | whole number | Live metrics in the cell; summed for the row total |
| `partial` | whole number | Partial metrics in the cell |
| `aspirational` | whole number | Aspirational metrics in the cell |

The sample is `deneb/samples/readiness.json`, one row per domain and mode that has at least one metric.

**DAX suggestions.**

```
Metric Count = COUNTROWS ( Metric )

Worst Readiness =
SWITCH (
    TRUE (),
    CALCULATE ( COUNTROWS ( Metric ), Metric[Readiness] = "aspirational" ) > 0, "aspirational",
    CALCULATE ( COUNTROWS ( Metric ), Metric[Readiness] = "partial" ) > 0, "partial",
    "live"
)
```

`live`, `partial` and `aspirational` follow `Metric Count` filtered to that readiness.

**Page sizing.** 1000 by 360 for fifteen domains. The domain column and the totals column are each 150px (the `labelWidth` and `totalWidth` params). The readiness word sits beside the count, not beneath it: at 13 rows in 360px each row has about 22px, too little for two lines.

**Notes.** Column order is the `modeOrder` param. No filter is needed; the Sources page is estate-wide.

### readiness-legend: footer readiness pills

**Purpose.** The three readiness pills at the right of every page footer, as in the app: "READINESS:" in muted mono, then LIVE, PARTIAL and ASPIRATIONAL, each a dot (emerald, amber, muted) and an ink word on a pale fill (good-fill, warn-fill, panel). No title; transparent.

**Dataset fields.**

| Field | Type | Notes |
| --- | --- | --- |
| `quarters` | whole number | Any non-blank value; bound to [Selected Quarters] only so Deneb has a row |

The pills come from a constant `values` layer, so they draw whatever the row holds. Deneb shows its landing screen until at least one field is in the dataset well, and Power BI gives no row when every measure is blank, so the bound field is a measure that is never blank rather than a readiness count, which is blank on pages with no live metrics. The sample is one row of `deneb/samples/waterfall.json`.

**Page sizing.** 420 by 36, right-aligned; padding 0.

### page-text: page header

**Purpose.** The header every page carries in the app, so no textbox is needed: the kicker "{REPORT} · {PAGE}" from `kicker` in muted mono capitals, an optional 120 by 40 logo placeholder at the top right (the `showLogo` param, on by default), the page title in 46px serif, and the one-sentence headline in 22px serif ink beneath. The headline breaks at the last space that fits the width and runs to two lines at most; a longer one ends in an ellipsis. The spec draws the first row by title, so bind one page's values.

**Dataset fields.**

| Field | Type | Notes |
| --- | --- | --- |
| `kicker` | text | Page kicker in the form "{Report} · {Page}", such as `Executive summary · Overview`; drawn in capitals |
| `title` | text | Page title |
| `headline` | text | The page's headline sentence |

The sample is `deneb/samples/pagetext.json`, one row per page id (overview, labs, actions, movement, each domain and lineage) with the headline each page composes at estate scope over six quarters. The pages compose their headlines inline, so the sample writer reproduces those rules; `pageId` is in the sample for filtering only.

**DAX suggestions.** Every page binds `kicker` to Page[Kicker] and `title` to Page[Title], from the disconnected Page table (model/README.md, The Page table), with a locked, hidden page filter Page[PageKey] is the page id so one row reaches the block. `headline` takes the page's own measure: [Overview Headline], [Labs Headline], [Actions Headline], [Movement Headline] (a build measure), [Domain Headline] on every domain page or [Sources Headline]. The template index lists [Domain Headline]; swap in the page's measure when mapping.

**Page sizing.** 1824 by 140 at the top of the page; padding 0. On pages that carry the lab legend the block is 1284 wide, so the legend has the top right corner.

### actions-summary: actions summary strip

**Purpose.** The Actions page summary, bare, 1824 by 120. Four tiles, each a mono label over a 40px serif number: Open actions, Due within 30 days, Past due and Act severity. To the right a due-date bar splits the open actions into Past due (red), This week (amber), Next 30 days (emerald) and Later (sage), with each bucket named and counted beneath it, so colour is never the only cue. The spec draws the first row.

**Dataset fields.**

| Field | Type | Notes |
| --- | --- | --- |
| `open` | whole number | Open actions |
| `due30` | whole number | Due from the refresh date to 30 days after it |
| `pastDue` | whole number | Due before the refresh date |
| `act` | whole number | Open actions of Act severity |
| `thisWeek` | whole number | Due within 7 days of the refresh date |
| `next30` | whole number | Due 8 to 30 days after the refresh date |
| `later` | whole number | Due more than 30 days after the refresh date |

The sample is `deneb/samples/actionssummary.json`, one row. A blank reads as 0.

**DAX suggestions.** [Open Actions], [Actions Due 30 Days] and [Actions Past Due] exist. [Actions Act], [Actions This Week], [Actions Next 30 Days] and [Actions Later] are still to be added to measures.dax.

**Page sizing.** 1824 by 120; padding 0. The tiles take 56 per cent of the width.

### overview-key: the Overview key

**Purpose.** A small card for the sixteenth domain slot on Overview. It shows the three band pills with their thresholds (Healthy 80 and above, Watch 60 to 79, Act below 60), the four group tags (OPS, RISK, ARCH, DEL) and the dashed Proposed tag with "not yet sourced". The content is constant.

**Dataset fields.**

| Field | Type | Notes |
| --- | --- | --- |
| `quarters` | whole number | Any non-blank value; bound to [Selected Quarters] only so Deneb has a row |

The sample is `deneb/samples/overviewkey.json`, one row.

**Page sizing.** 216 by 142.

### lab-legend: the chip key

**Purpose.** The four lab chips with their names in one right-aligned row, 12px sans ink beside each chip. Tables that show the lab as a chip alone rely on it. The layout puts it at the top right of the header area (x 1352, y 48, 520 by 28) on Overview, Labs, Actions, Movement and every domain page, beside a page-text block cut to 1284 wide. Items sort by `sortOrder` and shrink together if the names run long. Clicking a chip selects the lab.

**Dataset fields.**

| Field | Type | Notes |
| --- | --- | --- |
| `labId` | text | Selection key |
| `lab` | text | Lab name beside the chip |
| `labCode` | text | Optional; the two characters on the chip |
| `labColour` | text | Optional; the chip colour |
| `sortOrder` | whole number | Left to right order |

The sample is `deneb/samples/lablegend.json`, one row per lab.

**DAX suggestions.** Lab[LabKey], Lab[LabName], Lab[LabCode], Lab[LabColour] and Lab[SortOrder]. With a lab chosen in the Lab filter only that lab is drawn.

**Page sizing.** 520 by 28; padding 0.

### read-outs: domain read-out

**Purpose.** The Read-out block on a domain page: the kicker READ-OUT, then three ink bullet lines in 13.5px sans, in order. Each line breaks at the last space that fits and runs to two lines at most. A blank read-out is skipped.

**Dataset fields.**

| Field | Type | Notes |
| --- | --- | --- |
| `domainId` | text | Filter the visual to one domain; the first row by `domainId` is drawn |
| `readOut1`, `readOut2`, `readOut3` | text | The three read-out sentences, folded into bullets in that order |

The sample is `deneb/samples/readouts.json`, one row per domain at estate scope, reproduced from DomainPage's rules.

**DAX suggestions.** Bind [Read Out 1], [Read Out 2] and [Read Out 3].

**Page sizing.** 600 by 150 for three lines that each wrap once.

### actions-list: priority actions

**Purpose.** The Overview "Priority actions" list, titled as the app's card. Open actions sort by severity (Act first), then due date. Each 58px row has the lab chip and "DOMAIN · TEAM" in muted mono capitals, the description in 14px sans ink, and at the right a severity pill (ACT on a pale red fill with a red dot, WATCH on pale amber with an amber dot) above "Due 9 Oct" in muted. Thin dividers sit between rows. The list shows as many rows as the height allows; when some do not fit it keeps 22px for a muted "+N more" line. Rows are selectable by action.

**Dataset fields.**

| Field | Type | Notes |
| --- | --- | --- |
| `actionId` | text | One row per action; the selection key and final sort key |
| `domain` | text | Domain name, in the kicker line |
| `team` | text | Team name, in the kicker line |
| `description` | text | The action |
| `due` | date | Due date; sorts within a severity |
| `severity` | text | `act` or `watch` |

The sample is `deneb/samples/actionslist.json`, every open action by severity then due date.

**Page sizing.** 700 by 250 shows three rows and "+N more". Allow 58px a row.

### actions-table: open actions

**Purpose.** The Actions page table, dividers only. A muted mono caption reads "Open actions by severity then due date", adding ", showing first 23 of 27" when rows are cut. The header row is mono capitals: Domain, Team, Lab, Action, Due, Status. Each 28px row shows the domain, team, lab chip alone (the header's lab legend names it), the description (ellipsised), the due date such as "9 Oct 2026" with " · past due" when `daysFromRefresh` is below zero, and a severity pill with a dot. Columns follow the app: 140, 210 and 60px, then the action, then 150 and 100px at the right. Rows are selectable by action.

**Dataset fields.**

| Field | Type | Notes |
| --- | --- | --- |
| `actionId` | text | Selection key and final sort key |
| `domain` | text | Domain name |
| `team` | text | Team name |
| `lab` | text | Lab name, in the tooltip and the chip fallback |
| `description` | text | The action |
| `due` | date | Due date |
| `severity` | text | `act` or `watch` |
| `daysFromRefresh` | whole number | Optional; below zero marks the date past due |

The sample is `deneb/samples/actionslist.json`, shared with actions-list.

**Page sizing.** 1824 by 700 fits 23 rows below the caption and header. On the Actions page it is 1284 wide and runs the full body height, beside the Actions by domain rail at x 1352, 520 wide.

### team-matrix: teams by domain

**Purpose.** The Labs page Teams table. One row per team, weakest composite first. Each row has the team name, its lab chip, the composite in bold serif on a band-tinted cell with the band word beside it, then one heat cell per core domain: the score in bold on the band tint with a 3px band stripe at the left. The header row has mono capitals for Team, Lab and Composite and the domain names in small serif over two lines. The footer reads "Healthy 80 and above · Watch 60 to 79 · Act below 60". The composite band is computed from the score with the `healthyFrom` and `watchFrom` params. Clicking a heat cell selects the team.

**Dataset fields.**

| Field | Type | Notes |
| --- | --- | --- |
| `team` | text | One row per team per core domain; the selection key |
| `lab` | text | Lab name, in tooltips and the chip fallback |
| `composite` | whole number | The team's composite; sorts the rows, lowest first |
| `domainId` | text | Core domain key |
| `domain` | text | Domain name for the header |
| `domainOrder` | whole number | Column order, lowest first |
| `score` | whole number | The team's score for the domain |
| `band` | text | `healthy`, `watch` or `act` for the domain score |

The sample is `deneb/samples/teammatrix.json`; it also carries `compositeBand`, which the spec does not read.

**DAX suggestions.** `composite` must ignore the Domain filter: [Team Composite] does, where [Composite] under a domain row would not. `score` and `band` are [Score] and [Band Key].

**Page sizing.** 1284 by 520 for twelve teams; the header is 52px and the footer 28px, and rows share the rest. Team 222px, lab chip 40px, composite 112px, then the domains share the width.

### movement-table: movement by team

**Purpose.** The Movement by team table. A muted mono caption, then mono header capitals: Team, Lab, Composite, Change, Band. Each row, biggest fall first, has the team in semibold, the lab chip alone, "67 → 38" in mono, the signed change with its word ("−29 worse", "+4 better", "0 held") in amber, emerald or muted, and the band movement ("Watch → Act", "Healthy, held"). The word carries the direction, so colour is never the only cue. Rows are selectable by team.

**Dataset fields.**

| Field | Type | Notes |
| --- | --- | --- |
| `team` | text | One row per team; selection key |
| `lab` | text | Lab name, in the tooltip and the chip fallback |
| `from` | whole number | Composite at the start of the period |
| `to` | whole number | Composite now |
| `delta` | whole number | `to` minus `from`; sorts the rows, lowest first |
| `bandText` | text | Band movement, such as `Watch → Act` or `Healthy, held` |
| `q1` to `q5` | whole number | The team's composite five to one quarters before the current one, for the sparkline |
| `q6` | whole number | The team's composite now, the sparkline's last point |

The sample is `deneb/samples/movementteams.json`, twelve teams over the six-quarter window; it also carries `bandFrom` and `bandTo`.

**DAX suggestions.** [Composite Period Start], [Composite], [Score Delta over Period] and [Band Movement]; the sparkline's `q1` to `q5` are [Team Score Q1] to [Team Score Q5] and `q6` is [Team Composite], so each row's line is that team's own composite. The template works out the word from the delta, so there is no direction measure.

**Page sizing.** 1824 by 376 for twelve teams; rows are up to 28px. Columns start at 0, 460, 520, 740 and 920px; the team column is 460px so no team name is cut. The caption is the `caption` param, since the scope name and period are not in the rows.

### sources-strip: domain sources

**Purpose.** The Sources card on a domain page: the kicker SOURCES, then one 30px line per source system and ingestion mode, "ServiceNow" in ink and " · SQL direct query" in muted, with a readiness pill at the right (LIVE, PARTIAL or ASPIRATIONAL, each with a dot on a pale fill).

**Dataset fields.**

| Field | Type | Notes |
| --- | --- | --- |
| `domainId` | text | Filter the visual to one domain |
| `sourceOrder` | whole number | Optional; line order, else by system |
| `system` | text | Source system |
| `mode` | text | Ingestion mode key; with `system`, the selection key |
| `modeLabel` | text | Mode label, such as `SQL direct query` |
| `readiness` | text | `live`, `partial` or `aspirational` |

The sample is `deneb/samples/sourcesstrip.json`, one row per system and mode per domain in first-seen order. The app shows the readiness of the last metric with that pair; [Worst Readiness] shows the least ready, which can differ when a pair mixes readiness.

**Page sizing.** 700 by 160 fits four lines. The mode text starts at an estimate of the system name's width (the `charW` param, 7.3px a character).

### lineage-table: metric lineage

**Purpose.** The Sources page lineage, in two side-by-side tables. Domains split where the running row count first reaches half, as the app does, and each table's caption reads "METRIC SOURCES, STABILITY TO SECURITY" from its first and last domain. Columns are Domain, Metric, Source system, Mode, Refresh, Owner and Readiness, at the app's 11, 25, 16, 10, 8, 18 and 12 per cent. Rows are 19px. The domain name appears once per group in serif, with a stronger divider under each group. Mode shows the short name (SQL, Semantic, Spreadsheet, CSV, API). Readiness is a small pill with a dot and the word. Rows are selectable by metric.

**Dataset fields.**

| Field | Type | Notes |
| --- | --- | --- |
| `domainId` | text | Groups the rows |
| `domain` | text | Domain name |
| `domainOrder` | whole number | Group order |
| `metricId` | text | Selection key |
| `metricOrder` | whole number | Optional; order within a domain, else by metric name |
| `metric` | text | Metric name |
| `system` | text | Source system |
| `mode` | text | Ingestion mode key |
| `modeLabel` | text | Full mode label, used in tooltips and for an unknown mode |
| `refresh` | text | Refresh cadence |
| `owner` | text | Data owner |
| `readiness` | text | `live`, `partial` or `aspirational` |

The sample is `deneb/samples/lineage.json`, one row per metric.

**DAX suggestions.** Bind `domainOrder` to Domain[SortOrder] summarised as Minimum, so the grouped domain order reaches the rows without adding a Domain grouping column beside the Metric rows; `modeLabel` is [Mode Label]. The other fields are Metric columns.

**Page sizing.** 1824 by 700 for 57 metrics; the tables are 24px apart.

### leadership-chart: who leads what

**Purpose.** The Structure and skills page leadership chart, full width. Three rows of small cream cards joined by hairlines: the platform lead, four lab leads (lab chip, "LAB LEAD", headcount and contractor share) and twelve team leads ("TEAM LEAD", the team name, team headcount). Leaders are shown by role and unit, never by name. The layout is computed, not a tree transform: each node's x is its rank within its level (sorted by `id`) over the level's count, and each parent's connector sits at the mean x of its children, which is the parent's own centre because every level splits the width evenly.

**Dataset fields.**

| Field | Type | Notes |
| --- | --- | --- |
| `level` | whole number | 1 platform lead, 2 lab lead, 3 team lead |
| `id` | text | Node key; sorts nodes within a level |
| `parentId` | text | The node's parent; groups the connectors |
| `label` | text | Role, shown in mono capitals |
| `sublabel` | text | The team a team lead leads, shown under the role |
| `labCode`, `labColour` | text | Optional; the chip on lab lead nodes |
| `headcount` | whole number | People in the leader's span |
| `contractorPct` | whole number | Contractor share of the span, shown on levels 1 and 2 |

The sample is `deneb/samples/leadership.json`, seventeen rows.

**DAX suggestions.** [Span Headcount] and [Span Contractor Pct] read the one Person row in context and count its span: everyone, the lab or the team.

**Page sizing.** 1824 by 250; the three rows need about 170px under the title.

### role-composition: role groups by lab

**Purpose.** One stacked bar per lab, a segment per role group (Leadership, Product and delivery, Engineering, SRE and operations, Data, QA) labelled with its count where the segment is 20px or wider, and each segment's contractors as a lighter tail. The lab chip, name and headcount sit above the bar and the contractor share to its right. A key at the top names the groups and the tail.

**Dataset fields.**

| Field | Type | Notes |
| --- | --- | --- |
| `lab` | text | One bar per lab, in the `labOrder` param order |
| `labCode`, `labColour` | text | Optional; the chip |
| `roleGroup` | text | Segment, in the `roleOrder` param order |
| `count` | whole number | People in the group; blank reads as 0 |
| `contractors` | whole number | Of whom contractors; blank reads as 0 |

The sample is `deneb/samples/rolecomposition.json`, four labs by six groups.

**Page sizing.** 902 by 532; bars are about 48px with the lab line above each.

### skills-heat: critical skills coverage

**Purpose.** Sixteen critical skills, thinnest first, by lab plus an estate total. Each cell is the number of holders: muted at 0, amber with the word "thin" at 1 or 2, sage at 3 and above, with a 3px stripe. A Depth pill on the right names the estate-wide flag in words: Single-person, Thin or Covered. The total column comes from `estateCount` through a fold, so it needs no extra rows.

**Dataset fields.**

| Field | Type | Notes |
| --- | --- | --- |
| `skill` | text | Row; sorted by `estateCount`, then name |
| `lab` | text | Column, in the `labOrder` param order |
| `labCode`, `labColour` | text | Optional; the header chips |
| `count` | whole number | Holders in the lab; blank reads as 0 |
| `estateCount` | whole number | Holders across the estate, the same on every row of a skill |
| `flag` | text | `Single-person`, `Thin` or `Covered` |

The sample is `deneb/samples/skillsheat.json`, sixteen skills by four labs.

**DAX suggestions.** `count` is [Skill Count]; `estateCount` is [Skill Estate Count], which removes the Person filters, so it also keeps the zero cells in the grid; `flag` is [Skill Flag].

**Page sizing.** 902 by 532; 28px of header and about 25px a row.

## Performance

Pages took one to two minutes to render in Desktop. The cause was the score measures: every Deneb row ran an AVERAGEX over teams of a measure that ran ADDCOLUMNS over metrics of a measure that summed MetricValue, so one heat matrix or team table asked the engine for thousands of small queries.

What changed:

- `npx tsx powerbi/scripts/export-model.ts` now writes `model/csv/ScoreFact.csv`, a second fact beside MetricValue. It has one row per MetricValue row (4,104) with Value, the team-grain Target and Span, Score (0 to 100, as the app's `scoreMetric` for one team), Band and IsScored. The script checks every row against `src/data/health.ts` and then checks every domain and composite score, built from ScoreFact.csv, against the app.
- ScoreFact is an Import table joined to Team, Metric and Quarter, many to one and single direction, like MetricValue.
- `[Team Metric Score]`, `[Metric Score]` and `[Team Domain Score]` are now one AVERAGE over ScoreFact[Score]. `[Domain Score]`, `[Team Composite]`, `[Composite]`, the domain and team counts, `[Worst Domain]`, `[Team Rank]` and the Movement steps build the team and domain grain once, with SUMMARIZE over ScoreFact and GROUPBY, inside a single CALCULATETABLE. `[Worst Metric Key]` and `[Best Metric Key]` rank one SUMMARIZE of ScoreFact by metric. `[Metric Value]` stays on MetricValue by the Aggregate rule, now as SUM, AVERAGE or MAX.
- Measure names, figures and rounding are unchanged. The app rounds each team's domain score before averaging, so that step stays; it is now a scan of one table, not a measure call per team.

Expected effect: each score visual becomes a few storage engine scans of a 4,104-row table instead of a query per team, metric and domain. Pages should render in seconds. Confirm with Performance Analyzer before trusting that.

How to measure:

1. Open the regenerated PBIP and refresh, so ScoreFact loads.
2. View, Performance analyzer, Start recording.
3. Open each page in turn, then press Refresh visuals on each.
4. Stop, then Export. Send back the exported JSON, and note the three slowest visuals with their DAX query and Other times.

The rule: no nested iterators in measures bound to Deneb rows. A measure a Deneb visual evaluates per row must not iterate over a measure that itself iterates. Where the app needs a per-team or per-domain step, precompute it at refresh or build it once as a table inside the measure. `measures.dax` carries the same rule in its header.

## Regenerate samples and validate

From the app folder:

```
npm run deneb:samples
npm run deneb:templates
npm run deneb:validate
```

`deneb:samples` rewrites the fourteen files in `deneb/samples/` using the mock's own health functions, so the numbers match the app exactly. Paste a filtered slice of one into Deneb's dataset when testing a spec away from a live model.

`deneb:validate` takes every spec in `deneb/specs/`, merges the shared config, swaps in the rows its `.meta.json` selects, and renders it to `preview/<name>.svg` at the `width` and `height` in its `.meta.json` (800 by 360 when they are absent). It fits the whole visual, padding included, inside that size, as Deneb does inside a container. It then renders the spec a second time with its own `"container"` sizing left in place, handing the meta size to the view's `width` and `height` signals as a Deneb container would, and checks the result is that wide. Node has no window, so the resize listener behind container sizing cannot bind there; that single warning is expected and ignored on the second pass. It also checks every `"field"` the spec reads exists in the selected sample rows, unless a transform creates it (any `as`, or a fold's default `key` and `value`) or the view reads its own inline `data.values`. It exits with an error if any spec fails to compile, fails to render, reads a missing field, carries its own `config` block, or raises a Vega or Vega-Lite warning.

Each spec is then rendered once more as Power BI would feed it: the rows shuffled with a fixed seed, and every field named `due` or `refreshDate`, or ending in `Date`, turned into a JS Date at local midnight. The validator compares the two scenegraphs mark by mark. Each drawn item is reduced to its text, fill, stroke and position; a line or area keeps its points in drawing order. It fails if a mark draws a different number of items, or if any item's text or colour differs or it moves by more than 2px. So a spec that places items in arrival order, sorts dates as text, or drops a date it cannot parse, fails here.

Each sample row is given `__selected__: "neutral"` first, as Deneb gives rows when cross-filtering is on and nothing is selected. The Deneb functions are stand-ins, described under Interactivity and theme.

`deneb:templates` writes the fourteen templates and `INDEX.md`. The validator then checks each template: it maps every placeholder back to the field name in the template's dataset list, fails if a placeholder is left unmapped or is never used, checks the template's config matches `deneb/config.json`, and renders it with the same checks as the spec. It writes no preview for a template.

## Audit renders

`npx tsx powerbi/scripts/validate.ts --manifest-sizes` reads `layout/manifest.json` and groups every Deneb block by template, width, height and block `params`. For each group it writes `preview/audit/<template>-<w>x<h>.svg` (the Node render) and a JSON beside it holding one inline spec per page variant: the sample rows for that page's filter, with the block's params applied.

`npx tsx powerbi/scripts/render-blocks.ts <outDir>` then draws each group in headless Edge from the local vega and vega-lite builds, with Fraunces, JetBrains Mono and Inter from Google Fonts on the paper background. It writes a wrapper HTML, a PNG of every variant at its Power BI size, and a text report that lists ellipsised text, text past the container and overlapping text. Edge on Windows prints nothing to stdout, so the script drives one Edge over the DevTools protocol.

The browser renders are the source of truth. Node estimates text width, so its SVG can truncate text that fits, or fit text that will not. In the browser Vega measures text with the real fonts, as Deneb does. Where Power BI lacks Fraunces or JetBrains Mono it falls back to Georgia or Consolas, which run slightly wider.

`npm run deneb:audit` (`powerbi/scripts/audit-layout.ts`) checks every page's geometry against the manifest; it accepts a legend block sitting inside the header's right-hand region under the logo, rather than flagging it as an overlap.

## Preview

Open `preview/index.html` in a browser. It is a static page with no build step. Page one lays out the overview: hero across the top, then domain cards, then the heat matrix beside the trend, then the KPI tiles. Page two holds the bar list and the maturity ladder. Page three, Enrichment, holds the six newer visuals: the dumbbell beside the bump chart, then the waterfall, the sparkline grid, the actions timeline and the readiness matrix, then the lab cards. Each image is shown at its preview size.

Screenshots: `preview/png/` holds standalone PNG copies of the same renders plus the app's own report pages, for viewing from a mobile git client.

The page is written by hand; the validator only refreshes the SVGs it shows. At their preview sizes the page-one visuals stack to more than 1080px, so page one runs a little taller than a report page.

The validator renders in Node, where Vega has no canvas. It estimates text width at 0.8 of the font size per character, which is far wider than real text. A `limit` therefore cuts text short in the preview even when it fits in Deneb. So specs set limits only where a line can genuinely overrun at the preview size, and size them to the card edge.

Browsers draw an SVG inside an `<img>` with system fonts only, so the previews show Georgia, Segoe UI and Consolas rather than Fraunces or JetBrains Mono. Power BI does the same unless the fonts are installed.

## Compatibility

Deneb for Power BI bundles Vega-Lite 5 and Vega 5, so the pack is validated against those majors:

| Package | Version validated |
| --- | --- |
| `vega-lite` | 5.23.0 |
| `vega` | 5.33.1 |

Every spec declares `https://vega.github.io/schema/vega-lite/v5.json` as its `$schema`. Do not use Vega-Lite 6 features.

**Fonts.** Install Fraunces, Inter and JetBrains Mono on every build machine that opens the `.pbip` or renders the audit PNGs, so Deneb draws the app's own faces rather than a Windows fallback. Where a face is still missing, the specs, `deneb/config.json` and the theme's `textClasses` fall back to Cambria before Georgia: Cambria has lining figures, so a zero in a count such as "0 past due" reads as a digit, where Georgia's old-style zero reads as a stray "o".

## Adding a spec

1. Write `deneb/specs/<name>.vl.json` with `"data": {"name": "dataset"}`, container width and height, and the shared `params` block from `deneb/config.md`. Do not include a `config` block.
2. Write `deneb/specs/<name>.meta.json` naming the sample file, the filter and the preview size, for example `{"sample": "trend.json", "sampleFilter": {"domainId": "stability", "scope": "Estate"}, "width": 800, "height": 360}`.
3. Run `npm run deneb:templates`, then `npm run deneb:validate`, and check the preview.
4. Add a section for it under The visuals above, and an image for it in `preview/index.html`.
