---
version: alpha
name: "ThreadSim"
description: "A quiet instrument for a decision trainer. Measured from a reference site on 2026-11-07, then made ThreadSim's. Inspired by it, not affiliated with it."
colors:
  background: "#f9f7f6"
  text: "#2e2d2dcc"
  heading: "#2e2d2d"
  text-muted: "#706e6d"
  border: "#eeebea"
  border-strong: "#dad6d5"
  surface: "#ffffff"
  surface-inverse: "#2e2d2d"
  text-inverse: "#ffffff"
  primary: "#1f1e1e"
  primary-foreground: "#ffffff"
  link: "#1f1e1e"
  focus: "#0b6a7d"
  brand: "#0b6a7d"
  positive: "#247b50"
  negative: "#c4242a"
  warning: "#92400e"
  chart-1: "#0b6a7d"
  chart-2: "#2e2d2d"
  chart-3: "#706e6d"
typography:
  h3:
    fontFamily: "\"Inter\", ui-sans-serif, system-ui, sans-serif"
    fontSize: 32px
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: -0.01em
  h4:
    fontFamily: "\"Inter\", ui-sans-serif, system-ui, sans-serif"
    fontSize: 24px
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: -0.01em
  h5:
    fontFamily: "\"Inter\", ui-sans-serif, system-ui, sans-serif"
    fontSize: 20px
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: -0.01em
  body:
    fontFamily: "\"Inter\", ui-sans-serif, system-ui, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: -0.01em
  body-sm:
    fontFamily: "\"Inter\", ui-sans-serif, system-ui, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: -0.01em
  caption:
    fontFamily: "\"Inter\", ui-sans-serif, system-ui, sans-serif"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: -0.01em
rounded:
  md: 8px
  xl: 16px
  full: 9999px
spacing:
  "1": 4px
  "2": 8px
  "3": 12px
  "4": 16px
  "5": 20px
  "6": 24px
  "7": 28px
  "8": 32px
  "16": 64px
  section: 48px
  section-alt: 120px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    padding: "8px 13px"
    height: 36px
  button-outline:
    backgroundColor: transparent
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: "8px 13px"
    height: 36px
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
    padding: "8px 13px"
    height: 36px
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.xl}"
    padding: 32px
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    typography: "{typography.body}"
    rounded: 4px
    padding: "4px 12px"
    height: 38px
  link:
    textColor: "{colors.link}"
  band-inverse:
    backgroundColor: "{colors.surface-inverse}"
    textColor: "{colors.text-inverse}"
  page:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
---

# ThreadSim design system

Read this before any UI work. Values live in `client/src/styles/tokens.css`; see them all in `client/src/styles/palette.html`. The YAML above is generated from the measured roles; the CSS tokens are the source of truth for code.

## Overview

A quiet instrument for long sessions. A white sheet sits on a barely warm off-white frame, type is small and even, and figures line up digit for digit. Almost everything is near-black on white, so the one teal line, the player's route, is the first thing you see on any screen that has one. Depth is an edge and a tone step, never a shadow at rest. The bold thing is restraint with a purpose: the colour budget is under 3% of the screen, and it is spent on the route and on the data that judges it.

Measured from one reference site (`DECISIONS.md`), then made ours: its logo, red tile, blue links, blue focus ring, mono labels, marketing type sizes and resting shadows are gone. Inspired by it, not affiliated with it.

**Face and signature, chosen before any screen.** The face is the brand hue on the main data element. The signature element is the **route trace**: the player's route as one heavier teal line, the same line on Plan, Compare and the Results replay, so a trainee follows one object through the whole case.

## Colors

| Role | Token | Use it for | Never for |
| --- | --- | --- | --- |
| Frame | `--color-background` | Sidebar and top bar, one tinted L | Inside the sheet |
| Sheet, card | `--color-surface` | The page and its cards | |
| Well | `--color-surface-sunken` | The 3D scene ground, canvas wells | Page ground |
| Active | `--color-surface-active` | Active nav pill, selected list row | Hover |
| Edge | `--color-border` | Sheet and card edges | Controls |
| Rule | `--color-rule` | Row rules in tables and lists | Card edges |
| Control | `--color-border-strong` | Input and outlined button borders | Cards, which would read as heavy |
| Ink | `--color-heading` | Titles, identity cells, key figures | Running text |
| Body | `--color-text` | Running text, secondary cells | |
| Muted | `--color-text-muted` | Labels, meta, axis ticks, placeholders | Small text on a well: 4.43:1 there |
| Primary | `--color-primary` | The one filled button on a screen | Anything else filled |
| Brand | `--color-brand` | The player's route, main data element, active tab underline, target marker, focus ring | Buttons, nav fills, card fills, headings |
| Brand tint | `--color-brand-tint` with `--color-brand-strong` | One selected state per screen | Decoration |
| Status | `--color-positive`, `-negative`, `-warning`, and the pale `--color-pill-*` pairs | A result or a warning, always with words | A zero, an undefined change, or direction alone |

**Dark theme.** Tokens switch with the system setting (`prefers-color-scheme`), at the end of `tokens.css`; there is no in-app toggle. The reference has no dark mode, so these values are ours, not measured: true neutral darks with no navy, elevation by lightness, an inverted primary button, and the same teal hue lifted to `#4fb4c8`. Every text, status, risk and route colour reaches 4.5:1 on all three surfaces in dark, so the well limits below apply to light only. X-ray colours do not switch (spec §5.5). The YAML front matter lists the light values only. Always use tokens by role and the theme follows.

**Brand colour:** `#0b6a7d`, contrast-agent teal, hue 190. It sits 40 degrees from status green, and neither purple nor the cream-and-terracotta palette Taste bans.

**Risk tiers** differ by mark as well as colour (spec §7.3): forbidden is a solid fill (`--color-risk-forbidden`), heavy is hatched (`--color-risk-heavy`), proximity is an outline (`--color-risk-proximity`). `--opacity-risk-zone` is for volumes in the 3D scene.

**Routes** differ by colour, line pattern and label (spec §7.3). The player: `--color-route-player`, the heavier stroke, solid. Frontier routes: `--color-route-1` to `-4` with `--dash-route-1` to `-4`. Every route carries a text label on screen, and labels come from the optimizer's contract fields. Heavy and proximity risk, and frontier routes 3 and 4, fall to about 4.4:1 on a well, so label them in ink rather than in their own colour there.

**3D and X-ray.** three.js materials read `--color-scene-*`, `--color-marker-*` and the `--opacity-scene-*` values with `getComputedStyle`; never write a colour into a material. X-ray uses only `--color-xray-bg`, `--color-xray-ink` and `--opacity-xray-contrast`, and neutral grey is required by spec §5.5, not a style choice. The contrast fade is `--duration-contrast-fade`.

## Typography

Inter alone, self-hosted from `client/src/assets/fonts/` so the demo works offline. Sentence case everywhere. Tracking `--letter-spacing` at every size, as measured. Weight 400 for reading, 500 for titles and headings, and 600 for one job per screen at most. No mono face: the reference's mono labels were its identity.

| Role | Size / line | Weight | Notes |
| --- | --- | --- | --- |
| Answer figure | `--font-size-figure` 32/35 (phone 24/29) | 400 | One per screen; the largest figure answers the screen's question |
| Sibling figure | `--font-size-figure-sm` 20/24 | 400 | |
| Page title, h1 | `--font-size-title` 24/29 (phone 20/24) | 500 | A noun, never a greeting |
| Heading, card title | `--font-size-lead` 16/24 | 500 | Also phone data |
| Body, nav, cells | `--font-size-body` 14/20 | 400 | |
| Labels, meta, ticks, pills | `--font-size-meta` 12/16 | 400 or 500 | Nothing smaller, anywhere |

**Every number** gets class `.num` (tabular figures), is right-aligned in columns, keeps fixed decimals per measure, and puts its unit in a smaller grey suffix. The measured site's 48 and 64 px sizes and its 11.25 px phone size are dropped: an app title stays at or under 32 and nothing goes under 12.

## Layout

The dealt style is **Framed sheet** (Taste Skill app route, kind `builder`, seed 1515986158, `--keep palette,type`), chosen because it is built around one work surface and its surfaces match the measured ones. **The move:** the sidebar and the 48 px top bar share one frame tint with no rule between them; the page is a white sheet inset 8 px from the window's right and bottom edges, with a 1 px edge, 16 px corners and no shadow. Frame, sheet and card are the three levels; there is no fourth. The active tab is a 2 px brand underline.

- Sidebar `--size-sidebar`, content padding `--size-sheet-padding`, one gutter `--gap` both ways on every screen. Grid sums close: write the sum in a comment.
- Every screen has one h1, and one left and one right edge from its title to its last row.
- Plan and Drive drop the global sidebar to give the view the width, keeping a 48 px top bar with the exit, the case name and the screen's actions.

### Screen inventory

Each screen answers one question, and its largest block answers it. On Plan and Drive the 3D view is the work surface and is physically largest; the answer block is the first and largest *readout* beside it.

| Screen | Its one question | Largest block | Composition (dealt pattern) | At 390 px |
| --- | --- | --- | --- | --- |
| Library | Which case do I do next? | The next unlocked case: difficulty, Physics or Planning-only badge, stars earned | Sidebar and sheet. The next case leads at full width, the other cases follow as a list of peer rows, and import is one drop zone. Composed from the list rules | Works fully. Nav folds to the top bar; rows go two-line |
| Case brief | What am I about to face? | Scenario, target, arch type, fluoro budget | Tabbed object detail, without tabs: breadcrumb h1, then one scenario card with the facts as label-over-value, and "Start planning" as the one primary | Works fully. Facts become label and value rows |
| Plan | Is my route feasible, and what does it cost? | The live cost panel and the first warning | Builder canvas: 44 px top bar, `--size-palette` panel (entry, preset), the view as a well, `--size-readout` cost panel. Costs as key-value rows with right-aligned figures | Usable. View on top, cost panel below; a bottom sheet for presets |
| Compare | Is my route on the frontier? | Frontier routes overlaid, and the route that dominates mine | Insights with share tables: the overlay leads, then weight sliders beside one table of routes. No KPI strip; route labels are the row names | Usable. Overlay full width, then sliders, then the table as two-line rows |
| Drive | Where is my tip, and am I pushing on the wall? | The view, force meter, fluoro budget, distance to target | Builder canvas with no side panels: the view fills the sheet and one HUD strip holds the three readouts. No honesty line here | Usable. View on top, HUD as a divided row, large hold controls |
| Results | What one thing should I change? | The top feedback line, plan and drive scores, stars | Generated report: the feedback line is the first and largest text, scores sit beside it, then the remaining lines, then the replay timeline with the route trace | Works fully. One column, in the same order |

Taste's sheet has no pattern for Library or Results, so those two are composed from its app rules.

## Elevation & Depth

Resting surfaces are flat: an edge or a tone step, never both, never a shadow. The measured site's faint card shadow is dropped (`PLAN.md` design rules). `--shadow-float` is for what truly floats: a menu, popover, tooltip or dialog.

## Shapes

`--radius-card` 16 for sheet and cards, `--radius-control` 8 for buttons and swatches, `--radius-field` 4 for inputs, `--radius-full` for pills only. Nested radii step down. Bars and chart marks have square corners.

## Components

- **Buttons.** `--size-control` tall, `--radius-control`, weight 500. Primary: `--color-primary` fill, one per screen. Outline: `--color-border-strong` edge, for the alternative beside it. Otherwise a text action.
- **Inputs.** `--size-field` tall, `--radius-field`, `--color-border-strong` edge. Placeholders in `--color-text-muted`.
- **Cards.** `--color-surface`, `--color-border` edge, `--radius-card`, no shadow. Peer figures share one card split by hairlines rather than one tile each.
- **Tables.** Grey 12 px sentence-case headers with no fill band, `--size-row` rows, `--color-rule` rules, no zebra. Numbers right-aligned in `.num`, flush with their header.
- **Pills.** Beside a value or in a row only, pale fill with dark ink of the same hue, never above a heading.
- **Number tooltips.** Every number has a tooltip naming its formula, from `FormulaRef` (spec §6.6): `--color-surface-inverse`, `--color-text-inverse`, `--shadow-float`.
- **Force and fluoro meters.** A track as long as the budget, the fill the true ratio, both ends labelled from contract fields; `--color-negative` plus a word when over.
- **Notices.** The rail fallback notice and warnings use the pale warning pair, with words. Never a dialog that stops the drive.

## Do's and Don'ts

### Do

- Use a token for every colour, size, space, radius and shadow. If a value is missing, Aroovee adds a token; nobody hard-codes one.
- Give each screen one primary action and one answer figure.
- Show every number from a contract field, a mock or the real engine, with a formula tooltip. A missing value is a grey dash; a real zero is printed as zero.
- Show the honesty line on Library, Case brief and Results, in `--font-size-meta`. Never on the Drive HUD.
- Label presets and weights as illustrative (spec §9.4).
- Keep every action on a keyboard path, and colour never the only signal (spec §7.3).
- Draw every icon and chart with `/draw-svg` on the grid below.
- Import the wire through `client/src/wire/select.ts` only.

### Don't

- Don't invent numbers. **This overrides Taste's app rules**, which ask for believable sample data: ThreadSim never hard-codes realistic-looking numbers, clinical or otherwise.
- Don't use teal on buttons, nav fills, card fills or headings. A brand fill everywhere is exactly what the colour budget forbids.
- No gradients, glass, glows, emoji, eyebrow labels, 01/02/03 numbering, resting shadows, zebra rows, uppercase table headers, icons in tinted squares, or sparklines on figures.
- No rainbow charts: one hue per chart, then neutrals. Compare's route colours are the one exception, required by spec §7.3, and each also has a pattern and label.
- Don't say "realistic catheter simulation", "safer for patients", "clinically validated", or "optimal route" without the trade-offs on screen (spec §9.4).
- Don't use anything of the reference site's: logo, icons, art, copy or its red, blue or mono identity.

## Motion

Feedback only: press, hover, focus, a menu opening. `--duration-fast` for hover and press, `--duration-base` for menus, `--duration-slow` for sheets, `--ease-standard` throughout. Nothing performs an entrance. `theme.css` honours reduced motion. The contrast fade is the one timed effect, and it belongs to the X-ray shader.

## Iconography & Graphics

**Icons** live in `client/src/assets/icons/`, one file each, drawn with `/draw-svg`. The family: 24 canvas, 2 units of padding, stroke 1.75 (`--stroke-icon`, measured), round caps and joins, outline only, a coordinate step of 0.5 where the geometry allows, and paint on the root in `currentColor`. A solid dot is a stroked circle of `r=".75"`, so it needs no fill. No `transform`, no `<use>`, no text inside. Inline them, because `currentColor` can't reach inside an `<img>`. Show them at `--size-icon` beside a label or `--size-icon-lg` on controls, grey, never in a container. The caller sets colour: risk icons take `--color-risk-*`, and everything else takes the text colour around it.

Variants reuse exact geometry: the two entries are one body figure with the access bead moved, and the three presets share one hub bar. Always pair entries and presets with their text label: at 16 px they are similar on purpose.

**Empty states** live in `client/src/assets/empty/`. 240 x 180 frame, the same 1.75 stroke (3 for a wire or barrier, matching `--stroke-route-player`), token colours with hex fallbacks, one disc in `--color-background`, one object, `--color-brand` used once, no words in the art: the heading and action beside it say it. Inline them so they follow the theme: inside an `<img>` the tokens can't reach and the light hex fallbacks show. Place them on the sheet, since the disc matches the frame. Vessel bands are context in `--color-border-strong`, below 3:1 on purpose; the wire, barrier and marks carry the meaning.

**Charts** use `--color-chart-1` then the neutrals, `--color-grid` gridlines, straight segments, and carry no decoration.

## Responsive Behavior

Check at 1440, 768 and 390 px. Bands: phone up to 640, tablet 641 to 1100, desktop above. Media queries can't read custom properties, so these widths are the one number screens may write directly. On a phone the frame disappears and the sheet becomes the screen, under a 48 px top bar holding the menu, the title and one action. Margins `--size-sheet-padding`, tap targets at least `--size-touch`, data at 14 px or more, tables become two-line rows, and the page never scrolls sideways. Library, Case brief and Results must work well here; Plan and Drive must stay usable.

## Known Gaps

- The dark theme is checked on the specimen pages only until A2 puts it on real screens, and its scene values need the same look against real meshes in A3.
- `theme.css` is not yet imported by the app. The A2 shell imports it; until then `palette.html` is the only page using the font.
- Plan and Drive compositions are decided here but unbuilt. Scene colours need a look against real translucent meshes in A3, the first place a token could change.
- The X-ray colours are tested only in the 2D specimen until A5.
- Taste Skill is pinned at v2.1.5 (`DECISIONS.md`). The `npx skills add` line in the lane file installs 2.5.0, which has no `draw.mjs --app`, `lint.mjs` or `inspect.mjs`.

## Files

- `client/src/styles/tokens.css`: every token. Imported by `client/src/main.ts`.
- `client/src/styles/theme.css`: the font and element defaults, plain CSS. Import after tokens.
- `client/src/styles/palette.html`: every token on one page. In dev, open `/src/styles/palette.html`.
- `client/src/assets/fonts/`: Inter and its licence.
- `client/src/assets/icons/`, `client/src/assets/empty/`: the icon set and empty-state art. `metrics/aroovee/A1-icon-set.png` shows them all.
- `metrics/aroovee/A0-reference-measurement.md`: what was measured from the reference.
