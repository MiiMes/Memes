import { MediaCard } from "./MediaComponents.jsx";

export function FavoritesSection({ favorites, isFavorite, onToggleFavorite }) {
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
      {favorites.length ? (
        <div className="mosaic-grid">
          {favorites.map((item) => (
            <MediaCard
              key={`${item.provider}-${item.id}`}
              item={item}
              copyOnClick
              isFavorite={isFavorite(item)}
              onToggleFavorite={onToggleFavorite}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state favorites-empty">
          <p>You haven’t saved any GIFs yet.</p>
          <a href="#/">Search for GIFs to start your collection <span aria-hidden="true">↗</span></a>
        </div>
      )}
    </section>
  );
}
