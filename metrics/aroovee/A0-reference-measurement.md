# A0 reference measurement

Measured from https://tailscale.com on 2026-11-07 with `/extract-design`: home, /pricing and /kb, each at 1440 and 390 px. These are the reference's values before they were made ThreadSim's; `DESIGN.md` says what changed. Numbers only: screenshots stay out of the repo because they show the site's own logos and art.

## Colour roles (first guess: check them)

| Role | Value | Contrast on background | Why |
|---|---|---|---|
| background | `#f9f7f6` | 1:1 | the page background on most pages |
| text | `#2e2d2dcc` | 6.93:1 | body copy (paragraphs and lists) |
| heading | `#2e2d2d` | 12.86:1 | headings (h1–h6) |
| text-muted | `#706e6d` | 4.75:1 | 2% of text: secondary copy |
| border | `#eeebea` | 1.11:1 | the most used border colour (by length) |
| border-strong | `#dad6d5` | 1.35:1 | a stronger border, used less often |
| surface | `#ffffff` | 1.07:1 | panels and sections a step off the background |
| surface-inverse | `#2e2d2d` | 12.86:1 | the contrasting band (dark sections on a light site, or the reverse) |
| text-inverse | `#ffffff` | 1.07:1 | text on the contrasting band |
| primary | `#1f1e1e` | 15.57:1 | the start page's main buttons: the site leads with a neutral button and keeps colour for accents |
| primary-foreground | `#ffffff` | 1.07:1 | text on primary buttons |
| link | `#1f1e1e` | 15.57:1 | links in running text |
| focus | `#adc7fc` | 1.59:1 | the :focus-visible ring |

Primary, the candidates (share of the start page's prominent buttons · average share per page · share of links):

- `#5a82de`: start page 0% · per page 0% · links 0%
- `#324994`: start page 0% · per page 0% · links 0%
- `#d04841`: start page 0% · per page 0% · links 0%
- `#4b70cc`: start page 0% · per page 0% · links 0%


Chart colours, in order: `#adc7fc` (the focus ring) · `#5a82de` (blue, 2.7% of colour use, mostly in gradients) · `#324994` (indigo, 2.5% of colour use, mostly in gradients) · `#d04841` (red, 0.4% of colour use)

## Type

- **inter** (body and headings): 98.4% of text · weights 400, 500, 600 · Self-hosted
  stack: `inter, "inter Fallback", ui-sans-serif, system-ui, sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"`
- **mdio** (other): 1.6% of text · weights 500 · Self-hosted
  stack: `mdio, "mdio Fallback", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`
- Free fonts closest to **mdio**, measured weight by weight (width / ink / x-height as % of the original):
  - Geist Mono (error 0.048): 500→500 (100/104/100)
  - Red Hat Mono (error 0.064): 500→500 (100/99/94)
  - Source Code Pro (error 0.067): 500→500 (100/98/94)
  - DM Mono (error 0.113): 500→500 (100/105/94)

| Role | Size | Phone | Line height | Tracking | Weight | Family | Share | Example |
|---|---|---|---|---|---|---|---|---|
| display | 64px | 37.5px | 1.1 | -0.01em | 500 | inter | 1.1% | The best secure connectivity platform fo |
| h1 | 48px | 30px | 1.1 | -0.01em | 500 | inter | 0.3% | Business VPN |
| h2 | 36px | 33.75px | 1.1 | -0.01em | 500 | inter | 0.5% | Bring AI usage into focus with Aperture |
| h3 | 32px | 18.75px | 1.1 | -0.01em | 500 | inter | 0.5% | Over 100 integrations. |
| h4 | 24px | 18.75px | 1.2 | -0.01em | 500 | inter | 0.7% | Personal |
| h5 | 20px | 16.88px | 1.2 | -0.01em | 500 | inter | 14.2% | A Zero Trust identity-based connectivity |
| body | 16px | 15px | 1.5 | -0.01em | 400 | inter | 65.5% | Remote access for your global team |
| body-sm | 14px | 11.25px | 1.2 | -0.01em | 400 | inter | 13.5% | Quickstart |
| caption | 12px |  | 1.2 | -0.01em | 400 | inter | 3.6% | © 2026 Tailscale Inc. |

All sizes in use: 64px (1.1%, h2/h1/p) · 48px (0.3%, h3) · 36px (0.5%, h2/h3/h1) · 32px (0.5%, h2/span) · 24px (0.7%, h3/h2) · 20px (14.2%, summary/p/h3) · 16px (65.5%, p/th/li) · 14px (13.5%, a/button/li) · 12px (3.6%, span/th/a)
Weights: 400 77.9% · 500 21% · 600 1% · scale ratio ≈ 1.25 · font smoothing antialiased

## Space

Base unit: **4px** (93.7% of spacing values fit it; 4px fits 93.7%, 8px fits 35.6%).
Most used: 1* (2.1%) · 2* (1.3%) · 4 (19.9%) · 8 (21.3%) · 10* (2.4%) · 12 (29.3%) · 14* (0.8%) · 16 (3.9%) · 20 (4.5%) · 24 (2.3%) · 28 (1.8%) · 30* (1.8%) · 32 (4.3%) · 64 (2%)   (* off the grid)
Section padding (top/bottom of full-width bands): 48px, 120px; on phones 45px, 112.5px

## Shape

Radii: md 8px (20.8%) · xl 16px (59.5%) · full full (18.4%)
Borders: 1px ×950, 2px ×12 · styles solid, dotted
Shadows (lowest first):
- sm: `rgba(24, 23, 23, 0.02) 0px 4px 8px 0px` (100%)
Filters: `filter: grayscale(1)`

## Layout

Content widths (centred blocks): 1312px, 803px, 1248px, 1118px · max-widths 1440px, 768px, 900px, 775.142px, 1680px
Breakpoints: sm 641px (×13) · md 768px (×121) · lg 921px (×15) · xl 1024px (×85) · 2xl 1280px (×80) · mobile-first (min-width queries)
Grids: 12 columns ×5, 2 columns ×4, 4 columns ×2, 5 columns ×1
Home page bands, top to bottom: `#ffffff`

## Motion

Durations: fast 150ms (×621), base 200ms (×918), slow 300ms (×152) · easings `cubic-bezier(0.4, 0, 0.2, 1)` ×1597, `ease` ×89, `cubic-bezier(0, 0, 0.2, 1)` ×5
Transitioned: color, background-color, border-color, opacity, text-decoration-color, fill, stroke, outline-color · keyframes spinner-spin, overlay-spin, scroll, ketch-backdropFadeOut, ketch-bannerAnimateCenter, ketch-bannerAnimateTop, ketch-bannerDesktopAnimate, ketch-bannerDismissBottom, ketch-bannerDismissCenter, ketch-bannerMobileBottomAnimate · respects prefers-reduced-motion

## Components (most common first)

Buttons:
- **primary** ×12 “Get started”: bg `#1f1e1e`, text `#ffffff`, border none, radius 8px, 36px tall, padding 8/13/8/13, 16px/1 500 -0.01em · hover: border `1px solid rgba(0, 0, 0, 0)` · transition `color, background-color, border-color, box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1)`
- **outline** ×11 “Contact sales”: bg `none`, text `#1f1e1e`, border 1px solid `#1f1e1e`, radius 8px, 36px tall, padding 8/13/8/13, 16px/1 500 -0.01em · hover: border `1px solid oklab(0.236129 0.00147012 0.0004583 / 0.7)` · transition `color, background-color, border-color, box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1)`
- **secondary** ×10 “Security”: bg `#ffffff`, text `#1f1e1e`, border 1px solid `#1d1d1d1a`, radius full, 36px tall, padding 8/13/8/13, 14px/1 500 -0.01em · hover: border `1px solid oklab(0.236129 0.00147012 0.0004583 / 0.2)` · focus: `2px solid rgb(75, 112, 204)` · transition `color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to 0.2s cubic-bezier(0.4, 0, 0.2, 1)`
- **primary** ×2 “IT”: bg `#1f1e1e`, text `#ffffff`, border none, radius full, 36px tall, padding 8/13/8/13, 14px/1 500 -0.01em · hover: bg `#1f1e1e`, fg `#ffffff`, border `1px solid rgba(0, 0, 0, 0)` · focus: `2px solid rgb(75, 112, 204)` · transition `color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to 0.2s cubic-bezier(0.4, 0, 0.2, 1)`
- **secondary** ×1 “Get started”: bg `#ffffff`, text `#1f1e1e`, border none, radius 8px, 36px tall, padding 8/13/8/13, 16px/1 500 -0.01em · hover: border `1px solid rgba(0, 0, 0, 0)` · transition `color, background-color, border-color, box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1)`
- **primary** ×1 “Get started - it’s free!”: bg `#232222`, text `#ffffff`, border 1px solid `#232222`, radius 8px, 36px tall, padding 0/13/0/13, 16px/1.5 500 -0.01em, shadow `rgba(24, 23, 23, 0.02) 0px 4px 8px 0px` · hover: bg `#232222`, fg `#ffffff`, shadow `rgba(24, 23, 23, 0.08) 0px 4px 8px 0px`, border `1px solid rgb(35, 34, 34)` · focus: `1px auto rgb(16, 16, 16)` · transition `all 0.2s cubic-bezier(0.4, 0, 0.2, 1)`
Inputs:
- ×1: bg `#ffffff`, border 1px solid `#dad6d5`, radius 4px, 38px tall, padding 4/12/4/12, placeholder `#706e6d` · focus: 2px solid rgba(0, 0, 0, 0) 
Cards and panels:
- ×8: bg `#ffffff` on `#f9f7f6`, border 1px solid `#eeebea`, radius 16px, padding 32/32/32/32, shadow `rgba(24, 23, 23, 0.02) 0px 4px 8px 0px`
- ×1: bg `#d04841` on `#f9f7f6`, border none, radius 16px, padding 24/24/24/24
- ×1: bg `#ffffff` on `#f9f7f6`, border 1px solid `#eeebea`, radius 32px, padding 64/64/64/64, shadow `rgba(24, 23, 23, 0.02) 0px 4px 8px 0px`
- ×1: bg `#2e2d2d` on `#f9f7f6`, border none, radius 32px, padding 64/48/64/48
Links:
- standalone ×76: `#292524`, no underline, weight 400 · hover `#1c1917` none
- in-text ×50: `#292524`, no underline, weight 400 · hover `#1c1917` none
- in-text ×44: `#1f1e1e`, no underline, weight 500 · hover `#2e2d2d` none
- in-text ×22: `#2e2d2d`, no underline, weight 500 · hover `#2e2d2d` none
Footer: bg `#ffffff`, text `#181717`

