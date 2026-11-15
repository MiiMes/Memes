import { useEffect, useRef, useState } from "react";
import { MEDIA_TYPES, PROVIDER_NAMES, PROVIDERS } from "../constants/appConstants.js";
import { copyMediaToClipboard } from "../services/clipboard.js";

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

export function MediaCard({
  item,
  onSelect,
  onImageError,
  cardRef,
  overlayAlwaysVisible = false,
  copyOnClick = false,
}) {
  const videoRef = useRef(null);
  const copyFeedbackTimer = useRef(null);
  const [muted, setMuted] = useState(true);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(null);

  useEffect(() => () => window.clearTimeout(copyFeedbackTimer.current), []);

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

  function showCopyFeedback(feedback) {
    window.clearTimeout(copyFeedbackTimer.current);
    setCopyFeedback(feedback);
    if (feedback.tone !== "pending") {
      copyFeedbackTimer.current = window.setTimeout(() => setCopyFeedback(null), 2400);
    }
  }

  async function copyResult() {
    showCopyFeedback({ tone: "pending", message: "Copying…" });
    try {
      const copyFormat = await copyMediaToClipboard(item);
      const mediaName = item.kind === "sticker" ? "Sticker" : "GIF";
      const copyMessages = {
        native: `${mediaName} bytes copied (${copyFormat.mimeType}); paste to verify.`,
        "web-custom": `${mediaName} browser-specific data was accepted; Discord may ignore it.`,
      };
      showCopyFeedback({
        tone: copyFormat.method === "web-custom" ? "error" : "success",
        message: copyMessages[copyFormat.method] ?? `${mediaName} copy accepted by the browser.`,
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      showCopyFeedback({ tone: "error", message: `Copy failed: ${message}` });
    }
  }

  function handleClick() {
    if (copyOnClick) {
      void copyResult();
    } else if (item.video) {
      playWithSound();
    } else {
      onSelect?.();
    }
  }

  const ariaLabel = copyOnClick
    ? `Copy ${item.title} to clipboard`
    : item.video ? `Play ${item.title} with sound` : `Search ${item.title}`;

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
        onClick={handleClick}
        onMouseEnter={item.video ? playWithSound : undefined}
        onMouseLeave={item.video ? muteVideo : undefined}
        type="button"
        aria-label={ariaLabel}
        disabled={copyFeedback?.tone === "pending"}
      >
        {content}
        {copyFeedback && (
          <span className={`copy-feedback ${copyFeedback.tone}`} role="status">
            {copyFeedback.message}
          </span>
        )}
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
