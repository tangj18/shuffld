# Sliding Puzzle

A sliding-tile puzzle (the "one tile at a time into the empty gap" kind) that
you play with any image. Upload your own, or point it at a JSON library of
hosted image URLs.

## Features

- Classic slide mechanic — click a tile next to the gap, or use arrow keys.
- Guaranteed-solvable shuffles (only ever made from legal moves).
- Move counter, timer, and a solved animation.
- Grid presets: 3×4, 3×5, 4×4, 4×5, 4×6, 5×5.
- Load any image by drag-and-drop or file picker; the board matches its aspect ratio.
- **Image library from JSON** — paste an array, or fetch a hosted `.json` URL.
- Helpers: tile numbers, tile gaps, hold-to-peek at the full image, random pick.

## Getting started

```bash
npm install
npm run dev      # start the dev server (http://localhost:5173)
npm run build    # production build into dist/
npm run preview  # preview the production build locally
```

## Using your own images

Open the **Add from JSON** panel in the app and paste any of these shapes:

```json
["https://your-host.com/riven.jpg", "https://your-host.com/ahri.png"]
```

```json
[{ "title": "Riven", "url": "https://your-host.com/riven.jpg" }]
```

```json
{ "images": [{ "title": "Riven", "url": "https://your-host.com/riven.jpg" }] }
```

Or **Fetch** a hosted JSON file by URL. Two hosting notes:

- **Images** load cross-origin without any setup (they're used as backgrounds).
- **Fetching the JSON** cross-origin needs the host to send CORS headers. If a
  fetch fails, just paste the JSON instead — that path needs no CORS. A GitHub
  raw URL or Gist generally works for fetching.

To ship your own defaults baked in, edit the `IMAGE_LIBRARY` array at the top of
`src/SlidingPuzzle.jsx`.

## Deploying

`npm run build` outputs a static site in `dist/` — host it anywhere (Netlify,
Vercel, GitHub Pages, Cloudflare Pages, an S3 bucket, etc.).

If you deploy under a sub-path (e.g. a GitHub Pages project site at
`username.github.io/sliding-puzzle/`), set `base: "/sliding-puzzle/"` in
`vite.config.js` before building.
# shuffld
