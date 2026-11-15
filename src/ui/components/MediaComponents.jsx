import { useRef, useState } from "react";
import { MEDIA_TYPES, PROVIDER_NAMES, PROVIDERS } from "../constants/appConstants.js";

export function MediaSwitch({ kind, setKind }) {
  return (
    <div className="media-switch" role="group" aria-label="Media type">
      {MEDIA_TYPES.map(([value, label]) => (
        <button className={kind === value ? "active" : ""} key={value} onClick={() => setKind(value)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function ProviderFilters({ providers, onToggle, className = "" }) {
  return (
    <div className={`provider-filters ${className}`} aria-label="Content providers">
      <span>SEARCH WITH</span>
      {PROVIDERS.map((provider) => (
        <label className={`provider-pill ${providers.includes(provider) ? "selected" : ""}`} key={provider}>
          <input
            type="checkbox"
            checked={providers.includes(provider)}
            onChange={() => onToggle(provider)}
          />
          <span className={`provider-dot ${provider}`} />
          {PROVIDER_NAMES[provider]}
        </label>
      ))}
    </div>
  );
}

export function MediaCard({ item, onSelect, onImageError, cardRef, overlayAlwaysVisible = false }) {
  const videoRef = useRef(null);
  const [muted, setMuted] = useState(true);
  const [audioBlocked, setAudioBlocked] = useState(false);

  const playWithSound = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = false;
    setMuted(false);
    video.play().then(
      () => setAudioBlocked(false),
      () => {
        video.muted = true;
        setMuted(true);
        setAudioBlocked(true);
      },
    );
  };

  const muteVideo = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = true;
    setMuted(true);
  };

  const content = item.video ? (
    <video
      ref={videoRef}
      src={item.imageUrl}
      poster={item.posterUrl || undefined}
      autoPlay
      muted={muted}
      loop
      playsInline
      aria-label={item.title}
    />
  ) : (
    item.imageUrl
      ? <img src={item.imageUrl} alt={item.title} loading="lazy" onError={onImageError} />
      : <span className="media-placeholder">{item.title}</span>
  );
  return (
    <article className="media-card" ref={cardRef}>
      <button
        className={`media-button ${overlayAlwaysVisible ? "overlay-always-visible" : ""}`}
        onClick={item.video ? playWithSound : onSelect}
        onMouseEnter={item.video ? playWithSound : undefined}
        onMouseLeave={item.video ? muteVideo : undefined}
        type="button"
        aria-label={item.video ? `Play ${item.title} with sound` : `Search ${item.title}`}
      >
        {content}
        <span className="media-overlay">
          <span>{item.title}</span>
          {audioBlocked && <span>Click to enable sound</span>}
          <span className={`attribution ${item.provider}`}>
            {item.providers?.map((provider) => PROVIDER_NAMES[provider]).join(" + ") ??
              PROVIDER_NAMES[item.provider]}
          </span>
        </span>
      </button>
    </article>
  );
}
