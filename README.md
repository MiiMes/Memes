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

The browser-only meme editor accepts provider GIFs, uploaded images, and local
MP4, WebM, Ogg, or QuickTime video files up to 20 MB. Video decoding and
frame-by-frame GIF or video-only WebM/MP4 generation stay on-device; trim video
to a maximum 10-second export. WebM and MP4 require canvas capture and
`MediaRecorder`, contain no audio, and do not support reverse playback. MP4 is
offered only when the browser reports a compatible encoder. Browser codec
support varies by format. Animated GIFs can be trimmed,
sped up, reversed, and exported with timed text layers. Text positions can be
keyframed, including emoji sticker layers; optional face detection can suggest
positions across sampled video frames. This is not arbitrary-object tracking.
Canvas presets support square, landscape, portrait, and story
aspect ratios. **Export platform pack** creates a ZIP containing square,
landscape, and story renders plus an editable `.meme` project. Portable project
files bundle the source media and editor settings. Canvas text layers support
font choice, sizing, rotation, colors, Impact-style outlines, and drop shadows.

Batch variations render up to four alternate captions. Caption suggestions can
use the browser's built-in on-device multimodal `LanguageModel` API to inspect
the current image or video frame; the media is not uploaded. Face placement
uses the optional browser `FaceDetector` API when available. These APIs are
browser-dependent, report unsupported or failed operations, and leave manual
editing available. Visual similarity compares thumbnails from currently
loaded results and favorites on-device; cross-origin image restrictions can
prevent some images from being compared. It is not a provider-wide reverse
image search.

GIFs and still images can be downloaded or shared through the browser; GIF
export is limited by the format's 256-color palette. Draft source files and
settings, generated GIF favorites, favorite collections/tags, favorite fonts,
and recent searches are stored locally in the browser and are not synchronized
across devices. Editor changes are automatically saved as local drafts after
the media loads and are searchable with other drafts. Favorites can be exported
to and merged from a JSON backup; generated GIF bytes are included, so backups
can be large (50 MB maximum). Local drafts and their source files are not part
of that backup.

**Copy edit link** compresses the HTTPS source URL and bounded editor settings
with LZ-String in the URL fragment; existing uncompressed links continue to
open. No edit state is stored on a server. Anyone with the link can see its
media URL and caption text. Links are limited to 12 KB and do not embed local
uploads or image thumbnails; export a portable `.meme` project for those edits.
Source hosts may block browser-side access, and their media must be reachable
for a recipient to load the edit.

The editor supports drag-and-drop and paste for local media. On browsers that
provide the File System Access API, **Save to folder** opens a native save
picker; the usual download remains available as a fallback. Generated GIFs and PNG images can be copied with the Clipboard API where
supported.
Favorites search includes titles, captions, providers, and tags;
saved drafts are searchable too. **Search by meaning** uses a quantized
all-MiniLM model in the browser to rank local favorites and drafts. The model
is downloaded from Hugging Face on first use and cached by the browser; media,
queries, and library metadata are not sent for inference. **Remove background**
uses the quantized MODNet portrait-matting model to create a transparent PNG
from a still image. Its model is also downloaded on first use. Both features
are optional; model loading and inference require a compatible browser and
available memory. MODNet is portrait matting, not a general-purpose object
selection tool. The models are Apache-2.0 licensed.
Background removal currently loads the transparent cutout as the editor's
source image; it does not yet place a separate image-sticker layer over another
background.

**Collaborate live** uses WebRTC data channels and manual copy/paste of the
connection offer and answer, with no signaling server. Both participants must
open the same source media; only editor settings (captions, drawing, timing,
and transforms) are synchronized, not the media itself. Direct connectivity
depends on the networks involved. A STUN server can be entered to improve
connectivity across networks; it can see network addresses in the handshake,
but does not receive media or editor settings. Simultaneous edits use
last-update-wins synchronization rather than conflict-free merging.

The optional `<miimes-search>` web component can be embedded with a single
module script:

```html
<script type="module" src="https://miimes.github.io/Memes/miimes-search.js"></script>
<miimes-search providers="giphy,tenor" app-url="https://miimes.github.io/Memes/"></miimes-search>
```

The component searches the selected providers and opens the editor in a
dialog. `providers`, `locale`, and `app-url` are optional attributes. The
standalone bundle is emitted into `dist/miimes-search.js` by `npm run build`.
The host page needs no keys or server; provider keys are the public,
build-time keys in the MiiMes bundle, so this is not a keyless provider API.
These keys are visible to visitors and must be restricted in each provider
dashboard.
Reaction Deck presents filtered favorites in a fullscreen view with
arrow-key/Space navigation and clipboard actions. The home search can show
results grouped by provider or in one combined view.

On supported installed desktop PWAs, the manifest registers local image, video,
and `.meme` project files for **Open with Memes**. Browser support varies; a
failed file launch is reported in the app. An optional Chromium context-menu
extension is in [`browser-extension/`](./browser-extension/); it opens a web
image URL in the editor without host permissions or uploads. Some image hosts
block browser-side editing, in which case download the image and open it
locally. The installable PWA caches the app shell and static assets after the
first visit, and keeps up to 60 previously viewed external image previews for
offline use. Local drafts and generated favorites remain on-device; provider
search and uncached source media still require a network connection. Offline
availability depends on the browser retaining its service-worker and cache
storage.

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
