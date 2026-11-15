import { MEME_FONT_FAMILIES } from "../constants/memeFonts.js";

const FAVORITES_STORAGE_KEY = "memes:favorites:v1";
const COLLECTIONS_STORAGE_KEY = "memes:favorite-collections:v1";
const FAVORITE_FONTS_STORAGE_KEY = "memes:favorite-fonts:v1";
const GENERATED_GIFS_DB = "memes:generated-favorites";
const GENERATED_GIFS_STORE = "gifs";
const MEME_DRAFTS_STORE = "drafts";
const FAVORITES_BACKUP_FORMAT = "miimes-favorites-backup";
const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
const MAX_GENERATED_GIF_BYTES = 20 * 1024 * 1024;

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

function bytesToBase64(bytes) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function base64ToBlob(dataUrl) {
  const match = /^data:image\/gif;base64,([A-Za-z0-9+/=\r\n]+)$/.exec(dataUrl);
  if (!match || match[1].length > Math.ceil(MAX_GENERATED_GIF_BYTES * 4 / 3) + 8) {
    throw new Error("The backup contains invalid or oversized generated GIF data.");
  }
  const binary = atob(match[1].replace(/\s/g, ""));
  if (binary.length > MAX_GENERATED_GIF_BYTES) {
    throw new Error("A generated GIF in the backup exceeds the 20 MB limit.");
  }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: "image/gif" });
}

function isSafeFavoriteSource(value, allowPlaceholder = false) {
  if (allowPlaceholder && value === "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=") {
    return true;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function createCollectionId() {
  const uniqueId = globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `collection-${uniqueId}`;
}

export async function exportFavoritesBackup(favorites, collections, favoriteFonts = []) {
  const backupFavorites = await Promise.all(favorites.map(async (favorite) => {
    if (!favorite.generatedGifId) {
      if (!isSafeFavoriteSource(favorite.imageUrl)) {
        throw new Error(`Favorite "${favorite.title}" does not have a portable HTTPS image URL.`);
      }
      return favorite;
    }
    if (!isSafeFavoriteSource(favorite.imageUrl, true)) {
      throw new Error(`Favorite "${favorite.title}" does not have a portable HTTPS source URL.`);
    }

    const blob = await readGeneratedGif(favorite.generatedGifId);
    if (!(blob instanceof Blob) || blob.type !== "image/gif") {
      throw new Error(`Generated GIF data for "${favorite.title}" is unavailable.`);
    }
    if (blob.size > MAX_GENERATED_GIF_BYTES) {
      throw new Error(`Generated GIF "${favorite.title}" exceeds the 20 MB backup limit.`);
    }
    const dataUrl = `data:image/gif;base64,${bytesToBase64(new Uint8Array(await blob.arrayBuffer()))}`;
    return { ...favorite, generatedGifDataUrl: dataUrl };
  }));
  const payload = {
    format: FAVORITES_BACKUP_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    favorites: backupFavorites,
    collections,
    favoriteFonts: favoriteFonts.filter((font) => MEME_FONT_FAMILIES.has(font)),
  };
  const serialized = JSON.stringify(payload);
  if (new Blob([serialized]).size > MAX_BACKUP_BYTES) {
    throw new Error("This backup exceeds 50 MB. Remove some generated GIF favorites and try again.");
  }
  return new Blob([serialized], { type: "application/json" });
}

export async function importFavoritesBackup(file) {
  if (!(file instanceof Blob) || file.size > MAX_BACKUP_BYTES) {
    throw new Error("Choose a valid favorites backup under 50 MB.");
  }

  let backup;
  try {
    backup = JSON.parse(await file.text());
  } catch (cause) {
    throw new Error("The favorites backup is not valid JSON.", { cause });
  }
  if (
    backup?.format !== FAVORITES_BACKUP_FORMAT ||
    backup.version !== 1 ||
    !Array.isArray(backup.favorites) ||
    backup.favorites.length > 1000 ||
    !Array.isArray(backup.collections) ||
    backup.collections.length > 200 ||
    !Array.isArray(backup.favoriteFonts ?? [])
  ) {
    throw new Error("This is not a supported Memes favorites backup.");
  }

  const currentFavorites = readFavorites().favorites;
  const currentCollections = readFavoriteCollections().collections;
  const mergedCollections = [...currentCollections];
  const usedCollectionIds = new Set(currentCollections.map(({ id }) => id));
  const collectionIdMap = new Map();
  for (const collection of backup.collections) {
    if (
      !collection ||
      typeof collection.id !== "string" ||
      typeof collection.name !== "string" ||
      !collection.name.trim()
    ) {
      throw new Error("The backup contains an invalid collection.");
    }
    const existing = mergedCollections.find((entry) =>
      entry.name.toLocaleLowerCase() === collection.name.trim().toLocaleLowerCase(),
    );
    if (existing) {
      collectionIdMap.set(collection.id, existing.id);
      continue;
    }
    let id = collection.id;
    if (usedCollectionIds.has(id)) id = createCollectionId();
    usedCollectionIds.add(id);
    collectionIdMap.set(collection.id, id);
    mergedCollections.push({ id, name: collection.name.trim().slice(0, 40) });
  }

  const importedFavorites = [];
  const generatedBlobs = new Map();
  for (const entry of backup.favorites) {
    if (!normalizeFavorite(entry)) throw new Error("The backup contains an invalid favorite.");
    const favorite = normalizeFavorite({
      ...entry,
      collectionIds: (entry.collectionIds ?? [])
        .map((id) => collectionIdMap.get(id))
        .filter(Boolean),
    });
    if (entry.generatedGifId) {
      if (typeof entry.generatedGifDataUrl !== "string") {
        throw new Error(`The backup is missing generated GIF data for "${favorite.title}".`);
      }
      generatedBlobs.set(entry.generatedGifId, base64ToBlob(entry.generatedGifDataUrl));
    } else if (!isSafeFavoriteSource(favorite.imageUrl)) {
      throw new Error(`Favorite "${favorite.title}" must have a public HTTPS image URL.`);
    }
    if (entry.generatedGifId && !isSafeFavoriteSource(favorite.imageUrl, true)) {
      throw new Error(`Favorite "${favorite.title}" has an unsupported source URL.`);
    }
    importedFavorites.push(favorite);
  }

  const byKey = new Map(currentFavorites.map((favorite) => [favoriteKey(favorite), favorite]));
  importedFavorites.forEach((favorite) => {
    const key = favoriteKey(favorite);
    const existing = byKey.get(key);
    byKey.set(key, existing
      ? { ...existing, ...favorite, collectionIds: favorite.collectionIds }
      : favorite);
  });
  const mergedFavorites = Array.from(byKey.values());
  const mergedFonts = [...new Set([
    ...readFavoriteFonts().fonts,
    ...(backup.favoriteFonts ?? []).filter((font) => MEME_FONT_FAMILIES.has(font)),
  ])];

  const previousBlobs = new Map();
  const savedIds = [];
  try {
    for (const [id, blob] of generatedBlobs) {
      previousBlobs.set(id, await readGeneratedGif(id));
      await saveGeneratedGif(id, blob);
      savedIds.push(id);
    }

    const storage = globalThis.localStorage;
    const previousValues = [
      [FAVORITES_STORAGE_KEY, storage.getItem(FAVORITES_STORAGE_KEY)],
      [COLLECTIONS_STORAGE_KEY, storage.getItem(COLLECTIONS_STORAGE_KEY)],
      [FAVORITE_FONTS_STORAGE_KEY, storage.getItem(FAVORITE_FONTS_STORAGE_KEY)],
    ];
    try {
      storage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(mergedFavorites));
      storage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify(mergedCollections));
      storage.setItem(FAVORITE_FONTS_STORAGE_KEY, JSON.stringify(mergedFonts));
    } catch (cause) {
      for (const [key, value] of previousValues) {
        if (value === null) storage.removeItem(key);
        else storage.setItem(key, value);
      }
      throw cause;
    }
  } catch (cause) {
    for (const id of savedIds) {
      const previous = previousBlobs.get(id);
      if (previous) await saveGeneratedGif(id, previous);
      else await deleteGeneratedGif(id);
    }
    throw new Error(`Favorites backup could not be imported. ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
  }

  return {
    favorites: mergedFavorites,
    collections: mergedCollections,
    favoriteFonts: mergedFonts,
  };
}

export function readFavoriteFonts() {
  try {
    const stored = globalThis.localStorage.getItem(FAVORITE_FONTS_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    if (!Array.isArray(parsed)) throw new Error("Saved favorite fonts are invalid.");
    return {
      fonts: [...new Set(parsed.filter((font) => MEME_FONT_FAMILIES.has(font)))],
      error: "",
    };
  } catch (cause) {
    return {
      fonts: [],
      error: `Favorite fonts could not be loaded.${cause instanceof Error ? ` ${cause.message}` : ""}`,
    };
  }
}

export function toggleFavoriteFont(fonts, font) {
  if (!MEME_FONT_FAMILIES.has(font)) throw new Error("Choose a supported font.");
  const nextFonts = fonts.includes(font)
    ? fonts.filter((entry) => entry !== font)
    : [...fonts, font];
  try {
    globalThis.localStorage.setItem(FAVORITE_FONTS_STORAGE_KEY, JSON.stringify(nextFonts));
    return { fonts: nextFonts, error: "" };
  } catch (cause) {
    return {
      fonts,
      error: `Favorite fonts could not be saved.${cause instanceof Error ? ` ${cause.message}` : ""}`,
    };
  }
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
