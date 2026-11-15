import { useEffect, useRef, useState } from "react";
import { copyAnimatedGifToClipboard } from "../services/clipboard.js";
import { deleteMemeDraft, readMemeDrafts, saveMemeDraft } from "../services/favorites.js";
import { createCaptionedMedia, drawMemeOverlays } from "../services/memeEditor.js";

function createGeneratedFavoriteId() {
  const uniqueId = globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `edited-${uniqueId}`;
}

export function MemeEditor({
  item,
  onClose,
  isFavorite,
  onToggleFavorite,
  favoritesError = "",
}) {
  const [textLayers, setTextLayers] = useState([
    { id: "top", label: "Top text", text: "", position: "top" },
    { id: "bottom", label: "Bottom text", text: "", position: "bottom" },
  ]);
  const [selectedTextId, setSelectedTextId] = useState("top");
  const [fontSizePercent, setFontSizePercent] = useState(8);
  const [gifColorCount, setGifColorCount] = useState(256);
  const [gifDithering, setGifDithering] = useState(false);
  const [strokes, setStrokes] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingColor, setDrawingColor] = useState("#ff765f");
  const [drawingWidthPercent, setDrawingWidthPercent] = useState(0.006);
  const [transform, setTransform] = useState({
    zoom: 1,
    brightness: 100,
    contrast: 100,
    flipX: false,
  });
  const [isExporting, setIsExporting] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [exportError, setExportError] = useState("");
  const [copyFeedback, setCopyFeedback] = useState(null);
  const [outputUrl, setOutputUrl] = useState("");
  const [outputBlob, setOutputBlob] = useState(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [generatedFavoriteItem, setGeneratedFavoriteItem] = useState(null);
  const [isSavingFavorite, setIsSavingFavorite] = useState(false);
  const [favoriteActionError, setFavoriteActionError] = useState("");
  const [uploadedBlob, setUploadedBlob] = useState(null);
  const [uploadedUrl, setUploadedUrl] = useState("");
  const [outputActionFeedback, setOutputActionFeedback] = useState("");
  const [drafts, setDrafts] = useState([]);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [draftFeedback, setDraftFeedback] = useState("");
  const previewRef = useRef(null);
  const previewImageRef = useRef(null);
  const captionCanvasRef = useRef(null);
  const pointerActionRef = useRef(null);
  const sourceUrl = uploadedUrl || item?.imageUrl || "";
  const selectedText = textLayers.find((layer) => layer.id === selectedTextId);

  useEffect(() => {
    let active = true;
    readMemeDrafts().then((savedDrafts) => {
      if (active) setDrafts(savedDrafts.sort((left, right) => right.updatedAt - left.updatedAt));
    }).catch((cause) => {
      if (active) {
        setDraftFeedback(`Drafts could not be loaded. ${cause instanceof Error ? cause.message : String(cause)}`);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!outputUrl) return undefined;
    return () => URL.revokeObjectURL(outputUrl);
  }, [outputUrl]);

  useEffect(() => {
    if (!uploadedUrl) return undefined;
    return () => URL.revokeObjectURL(uploadedUrl);
  }, [uploadedUrl]);

  useEffect(() => {
    if (outputUrl) return undefined;

    function renderCaptionPreview() {
      const preview = previewRef.current;
      const image = previewImageRef.current;
      const canvas = captionCanvasRef.current;
      if (!preview || !image?.naturalWidth || !image.naturalHeight || !canvas) return;

      const pixelRatio = globalThis.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(image.offsetWidth * pixelRatio));
      canvas.height = Math.max(1, Math.round(image.offsetHeight * pixelRatio));
      canvas.style.left = `${image.offsetLeft}px`;
      canvas.style.top = `${image.offsetTop}px`;
      canvas.style.width = `${image.offsetWidth}px`;
      canvas.style.height = `${image.offsetHeight}px`;

      const context = canvas.getContext("2d");
      if (!context) return;
      context.scale(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
      drawMemeOverlays(
        context,
        textLayers,
        strokes,
        image.naturalWidth,
        image.naturalHeight,
        fontSizePercent,
      );
    }

    const image = previewImageRef.current;
    image?.addEventListener("load", renderCaptionPreview);
    renderCaptionPreview();

    const observer = typeof globalThis.ResizeObserver === "function"
      ? new globalThis.ResizeObserver(renderCaptionPreview)
      : null;
    if (previewRef.current) observer?.observe(previewRef.current);
    if (image) observer?.observe(image);
    if (!observer) globalThis.addEventListener("resize", renderCaptionPreview);

    return () => {
      image?.removeEventListener("load", renderCaptionPreview);
      observer?.disconnect();
      if (!observer) globalThis.removeEventListener("resize", renderCaptionPreview);
    };
  }, [fontSizePercent, outputUrl, sourceUrl, strokes, textLayers]);

  function invalidateOutput() {
    setOutputUrl("");
    setOutputBlob(null);
    setGeneratedFavoriteItem(null);
    setExportError("");
    setCopyFeedback(null);
    setFavoriteActionError("");
    setOutputActionFeedback("");
  }

  function updateTextLayer(id, updates) {
    setTextLayers((current) => current.map((layer) =>
      layer.id === id ? { ...layer, ...updates } : layer,
    ));
    invalidateOutput();
  }

  function updateTransform(key, value) {
    setTransform((current) => ({ ...current, [key]: value }));
    invalidateOutput();
  }

  function addTextLayer(text = "NEW TEXT", kind = "text") {
    const id = createGeneratedFavoriteId();
    const layer = {
      id,
      label: kind === "sticker" ? text : `Text ${textLayers.length - 1}`,
      text,
      kind,
      position: "custom",
      x: 0.5,
      y: 0.5,
      ...(kind === "sticker" ? { fontSizePercent: 20 } : {}),
      fontFamily: kind === "sticker" ? "sans-serif" : 'Impact, "Arial Black", sans-serif',
      fontWeight: kind === "sticker" ? 400 : 900,
      uppercase: kind !== "sticker",
      outline: kind !== "sticker",
      color: "#ffffff",
      strokeColor: "#000000",
    };
    setTextLayers((current) => [...current, layer]);
    setSelectedTextId(id);
    setIsDrawing(false);
    invalidateOutput();
  }

  function imagePoint(event) {
    const image = previewImageRef.current;
    const preview = previewRef.current;
    if (!image?.offsetWidth || !image.offsetHeight || !preview) return null;
    const previewBounds = preview.getBoundingClientRect();
    const left = previewBounds.left + image.offsetLeft;
    const top = previewBounds.top + image.offsetTop;
    return {
      x: Math.max(0, Math.min(1, (event.clientX - left) / image.offsetWidth)),
      y: Math.max(0, Math.min(1, (event.clientY - top) / image.offsetHeight)),
    };
  }

  function startPreviewPointer(event) {
    if (outputUrl) return;
    const point = imagePoint(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (isDrawing) {
      const stroke = {
        id: createGeneratedFavoriteId(),
        color: drawingColor,
        widthPercent: drawingWidthPercent,
        points: [point],
      };
      pointerActionRef.current = { kind: "draw", id: stroke.id };
      setStrokes((current) => [...current, stroke]);
      invalidateOutput();
      return;
    }

    const nearestLayer = textLayers
      .filter((layer) => layer.text.trim())
      .map((layer) => ({
        layer,
        distance: Math.hypot(
          (point.x - (layer.x ?? 0.5)) * (previewImageRef.current?.naturalWidth ?? 1),
          (point.y - (layer.y ?? (layer.position === "top" ? 0.08 : 0.92))) *
            (previewImageRef.current?.naturalHeight ?? 1),
        ),
      }))
      .filter(({ distance }) => distance < Math.max(45, (previewImageRef.current?.naturalWidth ?? 1) * 0.12))
      .sort((left, right) => left.distance - right.distance)[0]?.layer;
    if (!nearestLayer) return;
    setSelectedTextId(nearestLayer.id);
    pointerActionRef.current = { kind: "move", id: nearestLayer.id };
  }

  function movePreviewPointer(event) {
    const action = pointerActionRef.current;
    const point = imagePoint(event);
    if (!action || !point) return;
    if (action.kind === "draw") {
      setStrokes((current) => current.map((stroke) =>
        stroke.id === action.id
          ? { ...stroke, points: [...stroke.points, point] }
          : stroke,
      ));
      return;
    }
    setTextLayers((current) => current.map((layer) =>
      layer.id === action.id
        ? { ...layer, position: "custom", x: point.x, y: point.y }
        : layer,
    ));
    invalidateOutput();
  }

  function endPreviewPointer() {
    pointerActionRef.current = null;
  }

  function useUploadedFile(file) {
    if (!file) return;
    const supportedTypes = new Set(["image/gif", "image/jpeg", "image/png", "image/webp"]);
    if (!supportedTypes.has(file.type)) {
      setExportError("Choose a GIF, JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setExportError("This image is too large to edit in the browser.");
      return;
    }

    setUploadedBlob(file);
    setUploadedUrl(URL.createObjectURL(file));
    setOutputUrl("");
    setOutputBlob(null);
    setGeneratedFavoriteItem(null);
    setExportError("");
    setCopyFeedback(null);
    setFavoriteActionError("");
    setOutputActionFeedback("");
  }

  async function saveDraft() {
    if (!sourceUrl && !uploadedBlob) return;
    setIsSavingDraft(true);
    setDraftFeedback("");
    try {
      let sourceBlob = uploadedBlob;
      if (!sourceBlob) {
        const response = await fetch(sourceUrl);
        if (!response.ok) throw new Error(`Image request returned HTTP ${response.status}.`);
        sourceBlob = await response.blob();
      }
      const draft = {
        id: createGeneratedFavoriteId().replace("edited-", "draft-"),
        title: uploadedBlob?.name || item?.title || "Untitled meme",
        sourceBlob,
        textLayers,
        strokes,
        fontSizePercent,
        transform,
        gifColorCount,
        gifDithering,
        updatedAt: Date.now(),
      };
      await saveMemeDraft(draft);
      setDrafts((current) => [draft, ...current]);
      setDraftFeedback("Draft saved in this browser.");
    } catch (cause) {
      setDraftFeedback(`Draft could not be saved. ${cause instanceof Error ? cause.message : String(cause)}`);
    } finally {
      setIsSavingDraft(false);
    }
  }

  function loadDraft(draft) {
    setUploadedBlob(draft.sourceBlob);
    setUploadedUrl(URL.createObjectURL(draft.sourceBlob));
    setTextLayers(draft.textLayers);
    setSelectedTextId(draft.textLayers[0]?.id ?? "top");
    setStrokes(draft.strokes);
    setFontSizePercent(draft.fontSizePercent);
    setTransform(draft.transform);
    setGifColorCount(draft.gifColorCount);
    setGifDithering(draft.gifDithering);
    setOutputUrl("");
    setOutputBlob(null);
    setGeneratedFavoriteItem(null);
    setDraftFeedback(`Loaded “${draft.title}”.`);
  }

  async function removeDraft(draft) {
    try {
      await deleteMemeDraft(draft.id);
      setDrafts((current) => current.filter((entry) => entry.id !== draft.id));
      setDraftFeedback("Draft removed.");
    } catch (cause) {
      setDraftFeedback(`Draft could not be removed. ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }

  async function createMeme(event) {
    event.preventDefault();
    setIsExporting(true);
    setIsPreviewOpen(true);
    setExportError("");
    setOutputUrl("");
    setOutputBlob(null);
    setGeneratedFavoriteItem(null);
    setCopyFeedback(null);
    setFavoriteActionError("");
    setOutputActionFeedback("");
    try {
      const blob = await createCaptionedMedia(uploadedBlob || sourceUrl, {
        textLayers,
        strokes,
        fontSizePercent,
        transform,
        colorCount: gifColorCount,
        dither: gifDithering,
      });
      setOutputUrl(URL.createObjectURL(blob));
      setOutputBlob(blob);
      setGeneratedFavoriteItem(blob.type === "image/gif" ? {
        id: createGeneratedFavoriteId(),
        title: `Edited ${item?.title || "GIF"}`,
        imageUrl: item?.imageUrl || "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=",
        provider: "meme-editor",
        kind: "gif",
      } : null);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setExportError(message);
      setIsPreviewOpen(false);
    } finally {
      setIsExporting(false);
    }
  }

  async function copyMeme() {
    if (!outputBlob || outputBlob.type !== "image/gif") return;
    setIsCopying(true);
    setCopyFeedback(null);
    try {
      await copyAnimatedGifToClipboard(outputBlob);
      setCopyFeedback({
        tone: "success",
        message: "Animated GIF copied. Paste it into your target app to check support.",
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setCopyFeedback({ tone: "error", message });
    } finally {
      setIsCopying(false);
    }
  }

  function downloadMeme() {
    if (!outputBlob) return;
    const extension = outputBlob.type === "image/gif" ? "gif" : "png";
    const url = URL.createObjectURL(outputBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `meme.${extension}`;
    link.click();
    globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setOutputActionFeedback("Download started.");
  }

  async function shareMeme() {
    if (!outputBlob) return;
    const extension = outputBlob.type === "image/gif" ? "gif" : "png";
    const file = new File([outputBlob], `meme.${extension}`, { type: outputBlob.type });
    const shareData = { files: [file], title: "My meme" };
    if (typeof navigator.share !== "function" ||
      (typeof navigator.canShare === "function" && !navigator.canShare(shareData))) {
      downloadMeme();
      setOutputActionFeedback("File sharing is not supported here; the download has started instead.");
      return;
    }

    try {
      await navigator.share(shareData);
      setOutputActionFeedback("Meme shared.");
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") return;
      const message = cause instanceof Error ? cause.message : String(cause);
      setOutputActionFeedback(`Could not share the meme. ${message}`);
    }
  }

  async function toggleGeneratedFavorite() {
    if (!generatedFavoriteItem || !outputBlob || !onToggleFavorite) return;
    setIsSavingFavorite(true);
    setFavoriteActionError("");
    try {
      const saved = await onToggleFavorite(generatedFavoriteItem, outputBlob);
      if (!saved) setFavoriteActionError("Could not update this favorite. Check the favorites error message.");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setFavoriteActionError(message);
    } finally {
      setIsSavingFavorite(false);
    }
  }

  if (!item && !uploadedBlob) {
    return (
      <section className="meme-editor-empty">
        <p>Open the editor from a GIF card or upload an image to start making a meme.</p>
        <label className="meme-editor-upload">
          <span>Upload an image or GIF</span>
          <input
            type="file"
            accept="image/gif,image/jpeg,image/png,image/webp"
            onChange={(event) => {
              useUploadedFile(event.target.files[0]);
              event.target.value = "";
            }}
          />
        </label>
        <button className="meme-editor-secondary" type="button" onClick={onClose}>
          Back to GIFs
        </button>
      </section>
    );
  }

  return (
    <section className="meme-editor" aria-label="Meme editor">
      <div className="meme-editor-workspace">
        <button className="meme-editor-back" type="button" onClick={onClose}>← Back</button>
        <div
          className="meme-editor-preview"
          ref={previewRef}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            useUploadedFile(event.dataTransfer.files[0]);
          }}
          onPointerDown={startPreviewPointer}
          onPointerMove={movePreviewPointer}
          onPointerUp={endPreviewPointer}
          onPointerCancel={endPreviewPointer}
          onPaste={(event) => {
            const file = Array.from(event.clipboardData.files).find((entry) =>
              entry.type.startsWith("image/"),
            ) ?? Array.from(event.clipboardData.items)
              .find((entry) => entry.type.startsWith("image/"))
              ?.getAsFile();
            if (file) {
              event.preventDefault();
              useUploadedFile(file);
            }
          }}
          tabIndex={0}
          aria-label="Meme preview. Drag text to reposition it, or drop and paste an image here."
        >
          <img
            ref={previewImageRef}
            src={outputUrl || sourceUrl}
            alt={item?.title || "Meme preview"}
            style={{
              filter: `brightness(${transform.brightness}%) contrast(${transform.contrast}%)`,
              transform: `scale(${transform.zoom})${transform.flipX ? " scaleX(-1)" : ""}`,
            }}
          />
          {!outputUrl && (
            <canvas
              ref={captionCanvasRef}
              className="meme-editor-caption-canvas"
              aria-hidden="true"
            />
          )}
        </div>
        <p className="meme-editor-preview-note">
          {outputUrl ? "Previewing your animated GIF." : "Caption preview updates as you type."}
        </p>
      </div>
      <form className="meme-editor-controls" onSubmit={createMeme}>
        <div>
          <p className="eyebrow dark-eyebrow">MAKE IT YOURS</p>
          <h2>{item?.title || "Edit meme"}</h2>
        </div>
        <label className="meme-editor-upload">
          <span>Upload or replace image / GIF</span>
          <input
            type="file"
            accept="image/gif,image/jpeg,image/png,image/webp"
            onChange={(event) => {
              useUploadedFile(event.target.files[0]);
              event.target.value = "";
            }}
          />
        </label>
        <div className="meme-editor-layer-list" role="group" aria-label="Text and sticker layers">
          {textLayers.map((layer) => (
            <div className="meme-editor-layer-item" key={layer.id}>
              <button
                className={layer.id === selectedTextId ? "selected" : ""}
                type="button"
                onClick={() => setSelectedTextId(layer.id)}
                aria-pressed={layer.id === selectedTextId}
              >
                {layer.label}
              </button>
              {layer.id !== "top" && layer.id !== "bottom" && (
                <button
                  type="button"
                  aria-label={`Remove ${layer.label}`}
                  onClick={() => {
                    setTextLayers((current) => current.filter((entry) => entry.id !== layer.id));
                    if (selectedTextId === layer.id) setSelectedTextId("top");
                    invalidateOutput();
                  }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={() => addTextLayer()}>
            + Add text
          </button>
        </div>
        {selectedText && (
          <>
            <label className="meme-editor-field">
              <span>{selectedText.label}</span>
              <textarea
                value={selectedText.text}
                onChange={(event) => updateTextLayer(selectedText.id, { text: event.target.value })}
                maxLength={100}
                placeholder="Type your caption"
                disabled={isExporting}
              />
            </label>
            <label className="meme-editor-field">
              <span>Font</span>
              <select
                value={selectedText.fontFamily ?? 'Impact, "Arial Black", sans-serif'}
                onChange={(event) => updateTextLayer(selectedText.id, { fontFamily: event.target.value })}
                disabled={isExporting}
              >
                <option value={'Impact, "Arial Black", sans-serif'}>Impact</option>
                <option value="Arial, sans-serif">Arial</option>
                <option value="Georgia, serif">Georgia</option>
                <option value="monospace">Monospace</option>
              </select>
            </label>
            <div className="meme-editor-style-row">
              <label className="meme-editor-field">
                <span>Text color</span>
                <input
                  type="color"
                  value={selectedText.color ?? "#ffffff"}
                  onChange={(event) => updateTextLayer(selectedText.id, { color: event.target.value })}
                  disabled={isExporting}
                />
              </label>
              <label className="meme-editor-field">
                <span>Outline</span>
                <input
                  type="color"
                  value={selectedText.strokeColor ?? "#000000"}
                  onChange={(event) => updateTextLayer(selectedText.id, { strokeColor: event.target.value })}
                  disabled={isExporting}
                />
              </label>
            </div>
            <label className="meme-editor-field">
              <span>Alignment</span>
              <select
                value={selectedText.align ?? "center"}
                onChange={(event) => {
                  const align = event.target.value;
                  updateTextLayer(selectedText.id, {
                    align,
                    x: align === "left" ? 0.08 : align === "right" ? 0.92 : 0.5,
                  });
                }}
                disabled={isExporting}
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </label>
            <label className="meme-editor-field meme-font-size">
              <span>Rotation <strong>{selectedText.rotation ?? 0}°</strong></span>
              <input
                type="range"
                min="-180"
                max="180"
                step="5"
                value={selectedText.rotation ?? 0}
                onChange={(event) => updateTextLayer(selectedText.id, { rotation: Number(event.target.value) })}
                disabled={isExporting}
              />
            </label>
          </>
        )}
        <label className="meme-editor-field meme-font-size">
          <span>Text size <strong>{selectedText?.fontSizePercent ?? fontSizePercent}%</strong></span>
          <input
            type="range"
            min="5"
            max="24"
            value={selectedText?.fontSizePercent ?? fontSizePercent}
            onChange={(event) => {
              const nextSize = Number(event.target.value);
              if (selectedText?.kind === "sticker") {
                updateTextLayer(selectedText.id, { fontSizePercent: nextSize });
              } else {
                setFontSizePercent(nextSize);
                invalidateOutput();
              }
            }}
            disabled={isExporting}
          />
        </label>
        {selectedText && selectedText.kind !== "sticker" && (
        <>
          <label className="meme-editor-draw-toggle">
            <input
              type="checkbox"
              checked={selectedText.fontWeight !== 500}
              onChange={(event) => updateTextLayer(
                selectedText.id,
                { fontWeight: event.target.checked ? 900 : 500 },
              )}
            />
            Bold text
          </label>
          <label className="meme-editor-draw-toggle">
            <input
              type="checkbox"
              checked={selectedText.outline !== false}
              onChange={(event) => updateTextLayer(
                selectedText.id,
                { outline: event.target.checked },
              )}
            />
            Text outline
          </label>
          {selectedText.outline !== false && (
            <label className="meme-editor-field">
              <span>Outline thickness <strong>{selectedText.strokeWidth ?? 10}px</strong></span>
              <input
                type="range"
                min="1"
                max="30"
                value={selectedText.strokeWidth ?? 10}
                onChange={(event) => updateTextLayer(
                  selectedText.id,
                  { strokeWidth: Number(event.target.value) },
                )}
                disabled={isExporting}
              />
            </label>
          )}
        </>
        )}
        <div className="meme-editor-sticker-tools">
          <strong>Stickers</strong>
          {["😂", "🔥", "❤️", "✨", "💀", "👍"].map((sticker) => (
            <button
              key={sticker}
              type="button"
              aria-label={`Add ${sticker} sticker`}
              onClick={() => addTextLayer(sticker, "sticker")}
              disabled={isExporting}
            >
              {sticker}
            </button>
          ))}
        </div>
        <div className="meme-editor-image-tools">
          <strong>Image</strong>
          <button
            className="meme-editor-secondary"
            type="button"
            onClick={() => updateTransform("flipX", !transform.flipX)}
            aria-pressed={transform.flipX}
          >
            {transform.flipX ? "Flip back" : "Flip horizontally"}
          </button>
          <label className="meme-editor-field">
            <span>Center crop / zoom <strong>{transform.zoom.toFixed(1)}×</strong></span>
            <input
              type="range"
              min="1"
              max="2"
              step="0.05"
              value={transform.zoom}
              onChange={(event) => updateTransform("zoom", Number(event.target.value))}
            />
          </label>
          <label className="meme-editor-field">
            <span>Brightness <strong>{transform.brightness}%</strong></span>
            <input
              type="range"
              min="50"
              max="150"
              value={transform.brightness}
              onChange={(event) => updateTransform("brightness", Number(event.target.value))}
            />
          </label>
          <label className="meme-editor-field">
            <span>Contrast <strong>{transform.contrast}%</strong></span>
            <input
              type="range"
              min="50"
              max="150"
              value={transform.contrast}
              onChange={(event) => updateTransform("contrast", Number(event.target.value))}
            />
          </label>
        </div>
        <div className="meme-editor-gif-quality">
          <strong>GIF quality</strong>
          <label className="meme-editor-field">
            <span>Color palette</span>
            <select
              value={gifColorCount}
              onChange={(event) => {
                setGifColorCount(Number(event.target.value));
                invalidateOutput();
              }}
            >
              <option value="256">High quality · 256 colors</option>
              <option value="192">Balanced · 192 colors</option>
              <option value="128">Smaller file · 128 colors</option>
            </select>
          </label>
          <label className="meme-editor-draw-toggle">
            <input
              type="checkbox"
              checked={gifDithering}
              onChange={(event) => {
                setGifDithering(event.target.checked);
                invalidateOutput();
              }}
            />
            Reduce color banding (dithering)
          </label>
          <small>Dithering can add texture and increase file size. GIF output is limited to 256 colors per frame.</small>
        </div>
        <div className="meme-editor-drafts">
          <strong>Local drafts</strong>
          <button
            className="meme-editor-secondary"
            type="button"
            onClick={saveDraft}
            disabled={isSavingDraft}
          >
            {isSavingDraft ? "Saving draft…" : "Save current draft"}
          </button>
          {drafts.map((draft) => (
            <div className="meme-editor-draft" key={draft.id}>
              <span>{draft.title}</span>
              <button type="button" onClick={() => loadDraft(draft)}>Load</button>
              <button type="button" onClick={() => removeDraft(draft)} aria-label={`Delete ${draft.title}`}>×</button>
            </div>
          ))}
          {draftFeedback && <p className="meme-editor-copy-feedback" role="status">{draftFeedback}</p>}
        </div>
        <div className="meme-editor-draw-tools">
          <label className="meme-editor-draw-toggle">
            <input
              type="checkbox"
              checked={isDrawing}
              onChange={(event) => setIsDrawing(event.target.checked)}
            />
            Draw on meme
          </label>
          <input
            type="color"
            aria-label="Drawing color"
            value={drawingColor}
            onChange={(event) => setDrawingColor(event.target.value)}
            disabled={!isDrawing}
          />
          <label className="meme-editor-draw-width">
            <span>Brush size</span>
            <input
              type="range"
              min="0.002"
              max="0.02"
              step="0.001"
              value={drawingWidthPercent}
              onChange={(event) => setDrawingWidthPercent(Number(event.target.value))}
              disabled={!isDrawing}
            />
          </label>
          <button
            className="meme-editor-secondary"
            type="button"
            onClick={() => {
              setStrokes([]);
              invalidateOutput();
            }}
            disabled={!strokes.length}
          >
            Clear drawing
          </button>
        </div>
        {exportError && <p className="meme-editor-error" role="alert">{exportError}</p>}
        <div className="meme-editor-actions">
          <button className="meme-editor-primary" type="submit" disabled={isExporting}>
            {isExporting ? "Creating meme…" : "Create meme"}
          </button>
          {outputBlob?.type === "image/gif" && (
            <button
              className="meme-editor-secondary"
              type="button"
              onClick={copyMeme}
              disabled={isCopying}
            >
              {isCopying ? "Copying GIF…" : "Copy animated GIF"}
            </button>
          )}
        </div>
        {outputBlob && (
          <div className="meme-editor-output-actions">
            <button className="meme-editor-secondary" type="button" onClick={downloadMeme}>
              Download {outputBlob.type === "image/gif" ? "GIF" : "PNG"}
            </button>
            <button className="meme-editor-secondary" type="button" onClick={shareMeme}>
              Share meme
            </button>
          </div>
        )}
        {outputActionFeedback && <p className="meme-editor-copy-feedback" role="status">{outputActionFeedback}</p>}
        {copyFeedback && (
          <p
            className={`meme-editor-copy-feedback ${copyFeedback.tone}`}
            role={copyFeedback.tone === "error" ? "alert" : "status"}
          >
            {copyFeedback.message}
          </p>
        )}
      </form>
      {isPreviewOpen && (
        <div
          className="meme-editor-dialog-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) setIsPreviewOpen(false);
          }}
        >
          <section
            className="meme-editor-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="meme-editor-dialog-title"
          >
            <div className="meme-editor-dialog-heading">
              <h2 id="meme-editor-dialog-title">
                {isExporting ? "Creating your GIF…" : "Your animated meme"}
              </h2>
              <button
                className="meme-editor-dialog-close"
                type="button"
                onClick={() => setIsPreviewOpen(false)}
                aria-label="Close GIF preview"
              >
                ×
              </button>
            </div>
            {isExporting ? (
              <div className="meme-editor-dialog-loading" role="status">
                <span className="loader" />
                <span>Generating your GIF with the edited text…</span>
              </div>
            ) : outputUrl && (
              <>
                <img
                  className="meme-editor-dialog-image"
                  src={outputUrl}
                  alt={item?.title || "Your edited meme"}
                />
                <p className="meme-editor-dialog-note">
                  {outputBlob?.type === "image/gif"
                    ? "Right-click the GIF to copy it, or use the buttons to download or share."
                    : "Download or share your edited image."}
                </p>
                {outputBlob?.type === "image/gif" && (
                  <button
                    className="meme-editor-primary meme-editor-dialog-copy"
                    type="button"
                    onClick={copyMeme}
                    disabled={isCopying}
                  >
                    {isCopying ? "Copying GIF…" : "Click to Copy"}
                  </button>
                )}
                <div className="meme-editor-dialog-actions">
                  <button className="meme-editor-secondary" type="button" onClick={downloadMeme}>
                    Download {outputBlob?.type === "image/gif" ? "GIF" : "PNG"}
                  </button>
                  <button className="meme-editor-secondary" type="button" onClick={shareMeme}>
                    Share meme
                  </button>
                </div>
                {outputActionFeedback && <p className="meme-editor-copy-feedback" role="status">{outputActionFeedback}</p>}
                {outputBlob?.type === "image/gif" && generatedFavoriteItem && onToggleFavorite && (
                  <button
                    className="meme-editor-secondary meme-editor-dialog-favorite"
                    type="button"
                    onClick={toggleGeneratedFavorite}
                    disabled={isSavingFavorite}
                    aria-pressed={isFavorite?.(generatedFavoriteItem) ?? false}
                  >
                    {isSavingFavorite
                      ? "Saving favorite…"
                      : isFavorite?.(generatedFavoriteItem)
                        ? "♥ Remove from Favorites"
                        : "♡ Add to Favorites"}
                  </button>
                )}
                {(favoritesError || favoriteActionError) && (
                  <p className="meme-editor-error" role="alert">
                    {favoritesError || favoriteActionError}
                  </p>
                )}
                {copyFeedback && (
                  <p
                    className={`meme-editor-copy-feedback ${copyFeedback.tone}`}
                    role={copyFeedback.tone === "error" ? "alert" : "status"}
                  >
                    {copyFeedback.message}
                  </p>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
