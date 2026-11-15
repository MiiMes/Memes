const FAVORITES_STORAGE_KEY = "memes:favorites:v1";
const COLLECTIONS_STORAGE_KEY = "memes:favorite-collections:v1";
const GENERATED_GIFS_DB = "memes:generated-favorites";
const GENERATED_GIFS_STORE = "gifs";
const MEME_DRAFTS_STORE = "drafts";

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
    ...(typeof item.captionText === "string" && item.captionText.trim()
      ? { captionText: item.captionText.trim().slice(0, 1000) }
      : {}),
    ...(typeof item.generatedGifId === "string" && item.generatedGifId
      ? { generatedGifId: item.generatedGifId, mimeType: "image/gif" }
      : {}),
    collectionIds: Array.isArray(item.collectionIds)
      ? item.collectionIds.filter((id) => typeof id === "string")
      : [],
    tags: Array.isArray(item.tags)
      ? item.tags.filter((tag) => typeof tag === "string")
      : [],
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
    const request = globalThis.indexedDB.open(GENERATED_GIFS_DB, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(GENERATED_GIFS_STORE)) {
        request.result.createObjectStore(GENERATED_GIFS_STORE);
      }
      if (!request.result.objectStoreNames.contains(MEME_DRAFTS_STORE)) {
        request.result.createObjectStore(MEME_DRAFTS_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("The generated GIF database could not be opened."));
    request.onblocked = () => reject(new Error("The generated GIF database is blocked by another tab."));
  });
}

function runGeneratedGifRequest(mode, createRequest, storeName = GENERATED_GIFS_STORE) {
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
      transaction = database.transaction(storeName, mode);
      const request = createRequest(transaction.objectStore(storeName));
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

export function saveMemeDraft(draft) {
  if (!draft?.id || !(draft.sourceBlob instanceof Blob)) {
    return Promise.reject(new Error("A draft with its source image is required."));
  }
  return runGeneratedGifRequest(
    "readwrite",
    (store) => store.put(draft, draft.id),
    MEME_DRAFTS_STORE,
  );
}

export function readMemeDrafts() {
  return runGeneratedGifRequest(
    "readonly",
    (store) => store.getAll(),
    MEME_DRAFTS_STORE,
  );
}

export function deleteMemeDraft(id) {
  return runGeneratedGifRequest(
    "readwrite",
    (store) => store.delete(id),
    MEME_DRAFTS_STORE,
  );
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

export function readFavoriteCollections() {
  try {
    const stored = globalThis.localStorage.getItem(COLLECTIONS_STORAGE_KEY);
    if (!stored) return { collections: [], error: "" };
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) throw new Error("Saved collections data is invalid.");
    return {
      collections: parsed.filter((collection) =>
        collection && typeof collection.id === "string" && typeof collection.name === "string",
      ),
      error: "",
    };
  } catch (error) {
    return { collections: [], error: `Collections could not be loaded.${error instanceof Error ? ` ${error.message}` : ""}` };
  }
}

export function saveFavoriteCollection(collections, name) {
  const normalizedName = name.trim();
  if (!normalizedName) throw new Error("Enter a name for the collection.");
  if (collections.some((collection) =>
    collection.name.toLocaleLowerCase() === normalizedName.toLocaleLowerCase(),
  )) {
    throw new Error("A collection with that name already exists.");
  }

  const uniqueId = globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const nextCollections = [{ id: `collection-${uniqueId}`, name: normalizedName }, ...collections];
  try {
    globalThis.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify(nextCollections));
    return nextCollections;
  } catch (error) {
    throw new Error(`Collection could not be saved.${error instanceof Error ? ` ${error.message}` : ""}`);
  }
}

export function updateStoredFavorite(favorites, item, details) {
  const key = favoriteKey(item);
  const nextFavorites = favorites.map((favorite) =>
    favoriteKey(favorite) === key
      ? normalizeFavorite({ ...favorite, ...details })
      : favorite,
  );
  try {
    globalThis.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(nextFavorites));
    return { favorites: nextFavorites, error: "" };
  } catch (error) {
    return { favorites, error: errorMessage("saved", error) };
  }
}
