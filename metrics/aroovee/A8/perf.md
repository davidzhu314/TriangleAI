# A8 performance: initial load

Measured on 2026-11-07 on this laptop: AMD Ryzen AI 9 HX 370 (24 threads), 31 GB RAM, Windows 11.

**Setup.**
- The production build (`pnpm build`) was served by a static file server on localhost.
- Headless Chromium 1254, at 1440 × 900.
- The cache was cold on every run: a new browser context, with the cache turned off through the DevTools protocol.
- Three runs per profile; the median is shown.

**"First Library render"** is the time from navigation to the Library's next-case card. By then:
- the app has loaded;
- the case list has been fetched;
- every bundled case has been loaded and validated;
- V6 has picked the next case.

| Profile | First Library render (median) | Runs | Load event | First contentful paint |
| --- | --- | --- | --- | --- |
| Unthrottled | **0.27 s** | 0.28, 0.27, 0.24 s | 0.09 s | 0.10 s |
| CPU 4× slower, 10 Mbps, 40 ms | **2.81 s** | 2.77, 2.89, 2.81 s | 0.60 s | 0.59 s |
| CPU 4× slower, Fast 3G (1.6 Mbps, 150 ms) | 13.87 s | 13.84, 13.87, 13.97 s | 2.08 s | 1.58 s |

**Budget (spec Phase 8: initial load under 5 s on a laptop): met.** It's 0.27 s on this laptop, and 2.8 s with the CPU slowed 4× on a modest network.

**On Fast 3G it isn't met: 13.9 s.**
- The app itself paints in 1.6 s.
- The Library waits until it has loaded all three bundled cases before it draws. That's 2.2 MB of case files, most of it the `type-iii` and `low-tort` meshes (1.1 MB and 0.7 MB).
- If the demo venue's network is that slow, open the Library once before presenting; after that the cases are cached.
- The fix would be for the Library to read only `case.json` per case and load the meshes when a case opens. That changes how `ui/store.ts` uses David's loader, so I'd ask David first. Not done in A8.

## Bundle, per chunk (`dist/assets/`)

| Chunk | Raw | Gzip |
| --- | --- | --- |
| `index-*.js` (app and screens) | 148.5 KB | 48.2 KB |
| `2020-*.js` (validator, ajv) | 127.3 KB | 37.0 KB |
| `measure.worker-*.js` | 13.7 KB | 5.4 KB |
| `decimate.worker-*.js` | 7.0 KB | 2.9 KB |
| `index-*.css` | 36.9 KB | 6.7 KB |
| `inter-latin-wght-normal-*.woff2` | 47.1 KB | 47.1 KB (already compressed) |

**Total:** about 380 KB raw and 147 KB gzip, before case data. The screens are small next to the case meshes, so no route splitting was needed.
