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

## Source organization

- `src/ui/App.jsx` composes the app shell and page views.
- `src/ui/components/` contains the shared and page-specific UI components.
- `src/ui/hooks/` contains application state, provider queries, and hash routing.
- `src/ui/services/` contains provider requests and debugging logs.
- `src/ui/constants/` and `src/ui/utils/` hold shared configuration and pure helpers.

The existing `#/`, `#/explore`, `#/reactions`, and `#/api` routes are preserved
through `useHashRoute`; a routing dependency is unnecessary for these four
static views. App-wide state is coordinated by `useAppController` and passed
directly to the components that need it rather than introducing a global store
or context for the current shallow component tree.

The reactions page uses category-provided preview GIFs where available. For
reactions without one, it lazily searches that provider for a single preview
when the tile scrolls into view; TanStack Query caches fetched previews during
the session.

The browser-only meme editor accepts uploaded or provider GIFs and images,
supports draggable text and sticker layers, drawing, image adjustments, and
GIF palette/dithering options. Animated GIFs can be trimmed, sped up, reversed,
and exported with timed text layers. Canvas presets support square, landscape,
portrait, and story aspect ratios; output dimensions and file size are shown
after export. Portable `.meme` project files bundle the source image and editor
settings for download and import.

Batch variations render up to four alternate captions. Caption suggestions use
the browser's built-in on-device `LanguageModel` API only when available; face
placement uses the optional browser `FaceDetector` API when available. Both
features report when the browser does not support the API, and manual editing
remains available. Visual similarity compares thumbnails from currently
loaded results and favorites on-device; cross-origin image restrictions can
prevent some images from being compared. It is not a provider-wide reverse
image search.

GIFs and still images can be downloaded or shared through the browser; GIF
export is limited by the format's 256-color palette. Draft source files and
settings, generated GIF favorites, favorite collections/tags, and recent
searches are stored locally in the browser and are not synchronized across
devices. The home search can show results grouped by provider or in one
combined view. The installable PWA caches the app shell and static assets after
the first visit, so saved editor data remains available offline; provider
search still requires a network connection.

The language/region selector includes Tenor's documented search languages and
common regional variants. Tenor receives both `locale` and `country`; KLIPY
receives the combined locale. GIPHY search requests receive a supported `lang`
and `country_code`; trending media receives `country_code` only. GIPHY
categories and trending-search terms have no documented locale filter, so
those responses remain in the provider's default/global locale. For languages
outside GIPHY's supported list, `lang` is omitted rather than sending an
unsupported code.
Tenor's GIF Explore section uses a static list of its top-level category names
and loads matching GIF previews from Tenor's categories response or a lazy
one-result search when a category thumbnail is missing; other Explore
categories are loaded from their providers.

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
GIPHY Clips are available in the trending view through its `/v1/clips/trending`
endpoint; clip search is not enabled in this app. Tenor returns GIF-only
results for the Clips selection.
Tenor's current documentation says it is no longer accepting new API clients
as of January 2026, so confirm that the existing key remains active.

## GitHub Pages deployment

The included Actions workflow publishes the frontend from `main`. Add these
repository Actions secrets:

- `VITE_GIPHY_API_KEY`
- `VITE_TENOR_API_KEY`
- `VITE_KLIPY_API_KEY`

`VITE_TENOR_CLIENT_KEY` is optional and defaults to `tenor_web`.
The credentials are public in a static app, so restrict them in each provider
dashboard. After adding or changing the secrets, rerun the **Deploy frontend
to GitHub Pages** workflow; the keys are embedded into the frontend at build
time. For server-side secret protection and a reusable REST API, deploy
Express separately and use a server-backed frontend instead.
