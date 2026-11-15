# Memes

A static React + TanStack Query meme discovery app and provider API playground.
It runs entirely in the browser and can be deployed to GitHub Pages.

## Run locally

1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env.local` and add provider keys.
3. Run `npm install`, then `npm run dev`.
4. Open <http://localhost:5173>.

GitHub Actions secrets are only injected into the GitHub Pages build; they
cannot be read back into a local `.env.local` file. Add local development
values separately in `.env.local`. That file is ignored by Git.

The app calls GIPHY, Tenor, and KLIPY directly from the browser. The **API
console** page lets you select an operation and providers, run the requests,
inspect raw provider JSON, and review request status, duration, result count,
redacted endpoint URLs, and errors. TanStack Query Devtools are available in
the app to inspect cache and query state.

The reactions page uses category-provided preview GIFs where available. For
reactions without one, it lazily searches that provider for a single preview
when the tile scrolls into view; TanStack Query caches fetched previews during
the session.

The language/region selector includes Tenor's documented search languages and
common regional variants. Tenor receives both `locale` and `country`; KLIPY
receives the combined locale. GIPHY receives its documented `lang` values and
the selected country where supported; for languages outside GIPHY's supported
list, the `lang` parameter is omitted rather than sending an unsupported code.

## Important: no hosted REST API

This static site previews logical paths such as `/api/media/search`, but those
are **not HTTP API endpoints**. GitHub Pages cannot run Express or dynamically
return provider JSON to another frontend. A reusable REST API requires a
separately hosted server; this Pages-only version has no server runtime.

## Provider keys and terms

All `VITE_*` values are included in the public frontend bundle and visible to
site visitors. Use application keys restricted to the appropriate APIs and
allowed origins. Never put private credentials in these variables. Keys
previously pasted into chat should be revoked/rotated before deployment.

KLIPY integration approval was confirmed by the project owner. Its media URLs
are used as returned, and each provider remains in its own result section.
GIPHY Clips are not available through its public API (the docs list Clips as
SDK-only); Tenor and GIPHY return GIF-only results for the Clips selection.
Tenor's current documentation says it is no longer accepting new API clients
as of January 2026, so confirm that the existing key remains active.

## GitHub Pages deployment

The included Actions workflow publishes the frontend from `main`. Add these
repository Actions secrets:

- `VITE_GIPHY_API_KEY`
- `VITE_TENOR_API_KEY`
- `VITE_TENOR_CLIENT_KEY`
- `VITE_KLIPY_API_KEY`

The credentials are public in a static app, so restrict them in each provider
dashboard. After adding or changing the secrets, rerun the **Deploy frontend
to GitHub Pages** workflow; the keys are embedded into the frontend at build
time. For server-side secret protection and a reusable REST API, deploy
Express separately and use a server-backed frontend instead.
