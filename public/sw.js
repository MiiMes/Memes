const CACHE_PREFIX = "memes-app-";
const CACHE_NAME = `${CACHE_PREFIX}v3`;
const REMOTE_IMAGE_CACHE = "memes-remote-images-v1";
const MAX_CACHED_REMOTE_IMAGES = 60;
const APP_BASE = new URL("./", self.location.href);

async function fetchRemoteImage(request) {
  let cache;
  let cached;
  try {
    cache = await caches.open(REMOTE_IMAGE_CACHE);
    cached = await cache.match(request);
  } catch (cause) {
    console.error("Could not read the offline image cache.", cause);
  }
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (cache && (response.ok || response.type === "opaque")) {
      try {
        await cache.put(request, response.clone());
        const keys = await cache.keys();
        if (keys.length > MAX_CACHED_REMOTE_IMAGES) {
          await cache.delete(keys[0]);
        }
      } catch (cause) {
        console.error("Could not cache a recently viewed image for offline use.", cause);
      }
    }
    return response;
  } catch (cause) {
    if (cached) return cached;
    throw cause;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const response = await fetch(APP_BASE.href);
      if (!response.ok) throw new Error("The app shell could not be cached for offline use.");
      const html = await response.clone().text();
      await cache.put(APP_BASE.href, response);
      const assetPaths = Array.from(html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g))
        .map((match) => new URL(match[1], APP_BASE))
        .filter((url) => url.origin === self.location.origin && url.href.startsWith(APP_BASE.href));
      await cache.addAll([
        new URL("manifest.webmanifest", APP_BASE).href,
        new URL("memes-icon.svg", APP_BASE).href,
        ...assetPaths.map((url) => url.href),
      ]);
    })()
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET") return;
  if (request.destination === "image" && url.protocol === "https:" && url.origin !== self.location.origin) {
    event.respondWith(fetchRemoteImage(request));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (!url.href.startsWith(APP_BASE.href)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).then(async (response) => {
        const copy = response.clone();
        try {
          await caches.open(CACHE_NAME).then((cache) => cache.put(APP_BASE.href, copy));
        } catch (cause) {
          console.error("Could not refresh the offline app shell.", cause);
        }
        return response;
      }).catch(async () => {
        const cached = await caches.match(APP_BASE.href);
        if (cached) return cached;
        throw new Error("The app shell is not available offline yet.");
      }),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then(async (response) => {
        if (response.ok) {
          const copy = response.clone();
          try {
            await caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          } catch (cause) {
            console.error("Could not cache an app asset for offline use.", cause);
          }
        }
        return response;
      });
      return cached || network;
    }),
  );
});
