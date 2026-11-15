const FAVORITES_STORAGE_KEY = "memes:favorites:v1";

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
