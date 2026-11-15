import { useState } from "react";
import { MediaCard } from "./MediaComponents.jsx";

export function FavoritesSection({
  favorites,
  collections,
  collectionsError = "",
  onCreateCollection,
  onUpdateFavorite,
  isFavorite,
  onToggleFavorite,
  onEdit,
}) {
  const [collectionName, setCollectionName] = useState("");
  const [actionError, setActionError] = useState("");
  const [collectionFilter, setCollectionFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const normalizedTagFilter = tagFilter.trim().toLocaleLowerCase();
  const visibleFavorites = favorites.filter((item) => {
    const matchesCollection = collectionFilter === ""
      ? true
      : collectionFilter === "unsorted"
        ? !item.collectionIds?.length
        : item.collectionIds?.includes(collectionFilter);
    const matchesTag = !normalizedTagFilter ||
      item.tags?.some((tag) => tag.toLocaleLowerCase().includes(normalizedTagFilter));
    return matchesCollection && matchesTag;
  });

  function createCollection(event) {
    event.preventDefault();
    try {
      onCreateCollection(collectionName);
      setCollectionName("");
      setActionError("");
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function updateDetails(item, details) {
    if (!onUpdateFavorite(item, details)) {
      setActionError("Favorite details could not be saved in this browser.");
    } else {
      setActionError("");
    }
  }

  return (
    <section className="favorites-section" aria-labelledby="favorites-heading">
      <header className="section-heading">
        <div>
          <p className="eyebrow dark-eyebrow">YOUR COLLECTION</p>
          <h2 id="favorites-heading">Favorite GIFs</h2>
        </div>
        <span className="favorites-count">
          {favorites.length} {favorites.length === 1 ? "GIF" : "GIFs"}
        </span>
      </header>
      <form className="favorite-collection-form" onSubmit={createCollection}>
        <label>
          <span>New collection</span>
          <input
            value={collectionName}
            onChange={(event) => setCollectionName(event.target.value)}
            maxLength={40}
            placeholder="e.g. Work reactions"
          />
        </label>
        <button type="submit" disabled={!collectionName.trim()}>Create collection</button>
      </form>
      {actionError && <p className="favorites-storage-error" role="alert">{actionError}</p>}
      {collectionsError && <p className="favorites-storage-error" role="status">{collectionsError}</p>}
      {favorites.length > 0 && (
        <div className="favorite-filters">
          <label>
            <span>Collection</span>
            <select value={collectionFilter} onChange={(event) => setCollectionFilter(event.target.value)}>
              <option value="">All collections</option>
              <option value="unsorted">Unsorted</option>
              {collections.map((collection) => (
                <option key={collection.id} value={collection.id}>{collection.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Filter by tag</span>
            <input
              value={tagFilter}
              onChange={(event) => setTagFilter(event.target.value)}
              placeholder="Search tags"
            />
          </label>
          <span>{visibleFavorites.length} shown</span>
        </div>
      )}
      {favorites.length ? (
        visibleFavorites.length ? (
          <div className="mosaic-grid">
            {visibleFavorites.map((item) => (
              <div className="favorite-tile" key={`${item.provider}-${item.id}`}>
                <MediaCard
                  item={item}
                  copyOnClick
                  isFavorite={isFavorite(item)}
                  onToggleFavorite={onToggleFavorite}
                  onEdit={onEdit}
                />
                <div className="favorite-details">
                  <label>
                    <span>Collection</span>
                    <select
                      value={item.collectionIds?.[0] ?? ""}
                      onChange={(event) => updateDetails(
                        item,
                        { collectionIds: event.target.value ? [event.target.value] : [] },
                      )}
                    >
                      <option value="">Unsorted</option>
                      {collections.map((collection) => (
                        <option key={collection.id} value={collection.id}>{collection.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Tags (comma-separated)</span>
                    <input
                      key={`${item.id}-${(item.tags ?? []).join(",")}`}
                      defaultValue={(item.tags ?? []).join(", ")}
                      maxLength={160}
                      onBlur={(event) => updateDetails(item, {
                        tags: [...new Set(event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean))].slice(0, 12),
                      })}
                      aria-label={`Tags for ${item.title}`}
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state favorites-empty">No favorites match these filters.</div>
        )
      ) : (
        <div className="empty-state favorites-empty">
          <p>You haven’t saved any GIFs yet.</p>
          <a href="#/">Search for GIFs to start your collection <span aria-hidden="true">↗</span></a>
        </div>
      )}
    </section>
  );
}
