import { useCallback, useState } from "react";
import {
  isFavoriteItem,
  readFavorites,
  toggleStoredFavorite,
} from "../services/favorites.js";

export function useFavorites() {
  const [favoriteState, setFavoriteState] = useState(readFavorites);

  const isFavorite = useCallback(
    (item) => isFavoriteItem(favoriteState.favorites, item),
    [favoriteState.favorites],
  );
  const toggleFavorite = useCallback((item) => {
    setFavoriteState(toggleStoredFavorite(favoriteState.favorites, item));
  }, [favoriteState.favorites]);

  return {
    favorites: favoriteState.favorites,
    favoritesError: favoriteState.error,
    isFavorite,
    toggleFavorite,
  };
}
