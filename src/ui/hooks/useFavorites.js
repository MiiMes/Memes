import { useCallback, useEffect, useState } from "react";
import {
  deleteGeneratedGif,
  exportFavoritesBackup,
  importFavoritesBackup,
  isFavoriteItem,
  readGeneratedGif,
  readFavorites,
  readFavoriteCollections,
  readFavoriteFonts,
  saveFavoriteCollection,
  saveGeneratedGif,
  toggleFavoriteFont as toggleStoredFavoriteFont,
  toggleStoredFavorite,
  updateStoredFavorite,
} from "../services/favorites.js";

export function useFavorites() {
  const [favoriteState, setFavoriteState] = useState(readFavorites);
  const [collectionState, setCollectionState] = useState(readFavoriteCollections);
  const [favoriteFontState, setFavoriteFontState] = useState(readFavoriteFonts);
  const [hydratedState, setHydratedState] = useState({
    source: null,
    favorites: [],
    error: "",
  });

  useEffect(() => {
    let cancelled = false;
    const objectUrls = [];

    async function hydrateFavorites() {
      const errors = [];
      const favorites = await Promise.all(favoriteState.favorites.map(async (favorite) => {
        if (!favorite.generatedGifId) return favorite;
        try {
          const blob = await readGeneratedGif(favorite.generatedGifId);
          if (!blob) throw new Error("The saved GIF data is missing.");
          const imageUrl = URL.createObjectURL(blob);
          if (cancelled) {
            URL.revokeObjectURL(imageUrl);
            return favorite;
          }
          objectUrls.push(imageUrl);
          return { ...favorite, imageUrl };
        } catch (cause) {
          errors.push(cause instanceof Error ? cause.message : String(cause));
          return favorite;
        }
      }));

      if (!cancelled) {
        setHydratedState({
          source: favoriteState.favorites,
          favorites,
          error: errors.length
            ? `Some generated GIF favorites could not be loaded. ${errors[0]}`
            : "",
        });
      }
    }

    void hydrateFavorites();
    return () => {
      cancelled = true;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [favoriteState.favorites]);

  const isFavorite = useCallback(
    (item) => isFavoriteItem(favoriteState.favorites, item),
    [favoriteState.favorites],
  );
  const toggleFavorite = useCallback(async (item, generatedBlob) => {
    const currentFavorite = favoriteState.favorites.find(
      (favorite) => isFavoriteItem([favorite], item),
    );

    if (!generatedBlob && !item?.generatedGifId) {
      setFavoriteState(toggleStoredFavorite(favoriteState.favorites, item));
      return true;
    }

    if (currentFavorite) {
      const nextState = toggleStoredFavorite(favoriteState.favorites, item);
      if (nextState.error) {
        setFavoriteState({ ...nextState, favorites: favoriteState.favorites });
        return false;
      }
      setFavoriteState(nextState);
      if (currentFavorite.generatedGifId) {
        try {
          await deleteGeneratedGif(currentFavorite.generatedGifId);
        } catch (cause) {
          setFavoriteState({
            ...nextState,
            error: `Favorite removed, but its GIF data could not be deleted. ${
              cause instanceof Error ? cause.message : String(cause)
            }`,
          });
          return false;
        }
      }
      return true;
    }

    const generatedGifId = String(item.generatedGifId ?? item.id ?? "");
    if (!generatedGifId || !generatedBlob) {
      setFavoriteState({
        favorites: favoriteState.favorites,
        error: "Favorites could not be saved. The generated GIF data is unavailable.",
      });
      return false;
    }

    try {
      await saveGeneratedGif(generatedGifId, generatedBlob);
      const nextState = toggleStoredFavorite(favoriteState.favorites, {
        ...item,
        imageUrl: item.sourceImageUrl || item.imageUrl,
        generatedGifId,
      });
      if (nextState.error) {
        await deleteGeneratedGif(generatedGifId);
        setFavoriteState({ ...nextState, favorites: favoriteState.favorites });
        return false;
      }
      setFavoriteState(nextState);
      return true;
    } catch (cause) {
      setFavoriteState({
        favorites: favoriteState.favorites,
        error: `Favorites could not be saved. ${cause instanceof Error ? cause.message : String(cause)}`,
      });
      return false;
    }
  }, [favoriteState.favorites]);

  const createCollection = useCallback((name) => {
    const collections = saveFavoriteCollection(collectionState.collections, name);
    setCollectionState({ collections, error: "" });
  }, [collectionState.collections]);

  const updateFavorite = useCallback((item, details) => {
    const nextState = updateStoredFavorite(favoriteState.favorites, item, details);
    setFavoriteState(nextState);
    return !nextState.error;
  }, [favoriteState.favorites]);

  const toggleFavoriteFont = useCallback((font) => {
    const nextState = toggleStoredFavoriteFont(favoriteFontState.fonts, font);
    setFavoriteFontState(nextState);
    return !nextState.error;
  }, [favoriteFontState.fonts]);

  const exportData = useCallback(() => exportFavoritesBackup(
    favoriteState.favorites,
    collectionState.collections,
    favoriteFontState.fonts,
  ), [favoriteFontState.fonts, favoriteState.favorites, collectionState.collections]);

  const importData = useCallback(async (file) => {
    const imported = await importFavoritesBackup(file);
    setFavoriteState({ favorites: imported.favorites, error: "" });
    setCollectionState({ collections: imported.collections, error: "" });
    setFavoriteFontState({ fonts: imported.favoriteFonts, error: "" });
    return imported;
  }, []);

  const hasHydratedFavorites = hydratedState.source === favoriteState.favorites;
  return {
    favorites: hasHydratedFavorites ? hydratedState.favorites : favoriteState.favorites,
    favoritesError: [
      favoriteState.error,
      hasHydratedFavorites ? hydratedState.error : "",
    ].filter(Boolean).join(" "),
    collections: collectionState.collections,
    collectionsError: collectionState.error,
    isFavorite,
    toggleFavorite,
    favoriteFonts: favoriteFontState.fonts,
    favoriteFontsError: favoriteFontState.error,
    toggleFavoriteFont,
    exportData,
    importData,
    createCollection,
    updateFavorite,
  };
}
