const FAVORITES_STORAGE_KEY = "memes:favorites:v1";
const GENERATED_GIFS_DB = "memes:generated-favorites";
const GENERATED_GIFS_STORE = "gifs";

function normalizeFavorite(item) {
  if (
    !item ||
    typeof item !== "object" ||
    item.kind !== "gif" ||
    typeof item.imageUrl !== "string" ||
    !item.imageUrl
  ) {
    return null;
  }

  const provider = typeof item.provider === "string" && item.provider
    ? item.provider
    : "unknown";
  return {
    id: String(item.id ?? item.imageUrl),
    title: typeof item.title === "string" && item.title ? item.title : "GIF",
    imageUrl: item.imageUrl,
    provider,
    providers: Array.isArray(item.providers) ? item.providers : [provider],
    ...(typeof item.generatedGifId === "string" && item.generatedGifId
      ? { generatedGifId: item.generatedGifId, mimeType: "image/gif" }
      : {}),
    kind: "gif",
  };
}

function favoriteKey(item) {
  return `${item.provider}:${item.id ?? item.imageUrl}`;
}

function errorMessage(action, error) {
  const detail = error instanceof Error ? ` ${error.message}` : "";
  return `Favorites could not be ${action}.${detail}`;
}

function openGeneratedGifsDatabase() {
  if (!globalThis.indexedDB) {
    return Promise.reject(new Error("This browser does not support saving generated GIFs."));
  }

  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(GENERATED_GIFS_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(GENERATED_GIFS_STORE)) {
        request.result.createObjectStore(GENERATED_GIFS_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("The generated GIF database could not be opened."));
    request.onblocked = () => reject(new Error("The generated GIF database is blocked by another tab."));
  });
}

function runGeneratedGifRequest(mode, createRequest) {
  return openGeneratedGifsDatabase().then((database) => new Promise((resolve, reject) => {
    let result;
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      database.close();
      reject(error);
    };

    let transaction;
    try {
      transaction = database.transaction(GENERATED_GIFS_STORE, mode);
      const request = createRequest(transaction.objectStore(GENERATED_GIFS_STORE));
      request.onsuccess = () => {
        result = request.result;
      };
      request.onerror = () => fail(request.error ?? new Error("The generated GIF request failed."));
      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        database.close();
        resolve(result);
      };
      transaction.onerror = () => fail(transaction.error ?? new Error("The generated GIF transaction failed."));
      transaction.onabort = () => fail(transaction.error ?? new Error("The generated GIF transaction was aborted."));
    } catch (error) {
      fail(error);
    }
  }));
}

export function saveGeneratedGif(id, blob) {
  if (!id || blob?.type !== "image/gif") {
    return Promise.reject(new Error("A generated GIF is required to save this favorite."));
  }
  return runGeneratedGifRequest("readwrite", (store) => store.put(blob, id));
}

export function readGeneratedGif(id) {
  return runGeneratedGifRequest("readonly", (store) => store.get(id));
}

export function deleteGeneratedGif(id) {
  return runGeneratedGifRequest("readwrite", (store) => store.delete(id));
}

export function readFavorites() {
  try {
    const stored = globalThis.localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!stored) return { favorites: [], error: "" };

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) throw new Error("Saved favorites data is invalid.");

    const favorites = parsed.map(normalizeFavorite).filter(Boolean);
    const error = favorites.length === parsed.length
      ? ""
      : "Some saved favorites were invalid and have been skipped.";
    return { favorites, error };
  } catch (error) {
    return { favorites: [], error: errorMessage("loaded", error) };
  }
}

export function toggleStoredFavorite(favorites, item) {
  const favorite = normalizeFavorite(item);
  if (!favorite) throw new Error("Only GIFs with an image URL can be favorited.");

  const key = favoriteKey(favorite);
  const nextFavorites = favorites.some((entry) => favoriteKey(entry) === key)
    ? favorites.filter((entry) => favoriteKey(entry) !== key)
    : [favorite, ...favorites];

  try {
    globalThis.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(nextFavorites));
    return { favorites: nextFavorites, error: "" };
  } catch (error) {
    return {
      favorites: nextFavorites,
      error: errorMessage("saved", error),
    };
  }
}

export function isFavoriteItem(favorites, item) {
  return favorites.some((favorite) => favoriteKey(favorite) === favoriteKey(item));
}
