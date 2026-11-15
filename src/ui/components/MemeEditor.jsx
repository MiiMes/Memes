import { useEffect, useRef, useState } from "react";
import { copyAnimatedGifToClipboard } from "../services/clipboard.js";
import { deleteMemeDraft, readMemeDrafts, saveMemeDraft } from "../services/favorites.js";
import { createCaptionedMedia, drawMemeOverlays, inspectMedia } from "../services/memeEditor.js";
import { createMemeProject, readMemeProject } from "../services/memeProject.js";

const EXPORT_PRESETS = {
  original: null,
  square: { width: 512, height: 512, label: "Square · 1:1" },
  landscape: { width: 640, height: 480, label: "Landscape · 4:3" },
  portrait: { width: 480, height: 600, label: "Portrait · 4:5" },
  story: { width: 540, height: 960, label: "Story · 9:16" },
};

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
  const [timeline, setTimeline] = useState({
    startMs: 0,
    endMs: 0,
    speed: 1,
    reverse: false,
  });
  const [mediaInfo, setMediaInfo] = useState(null);
  const [previewTimeMs, setPreviewTimeMs] = useState(0);
  const [mediaInfoError, setMediaInfoError] = useState("");
  const [outputPreset, setOutputPreset] = useState("original");
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
  const [projectFeedback, setProjectFeedback] = useState("");
  const projectFileRef = useRef(null);
  const [variantCaptions, setVariantCaptions] = useState("");
  const [variantItems, setVariantItems] = useState([]);
  const [isGeneratingVariants, setIsGeneratingVariants] = useState(false);
  const [variantError, setVariantError] = useState("");
  const [copilotPrompt, setCopilotPrompt] = useState("");
  const [copilotFeedback, setCopilotFeedback] = useState("");
  const [faceFeedback, setFaceFeedback] = useState("");
  const [isDetectingFaces, setIsDetectingFaces] = useState(false);
  const previewRef = useRef(null);
  const previewImageRef = useRef(null);
  const captionCanvasRef = useRef(null);
  const pointerActionRef = useRef(null);
  const sourceUrl = uploadedUrl || item?.imageUrl || "";
  const selectedText = textLayers.find((layer) => layer.id === selectedTextId);
  const outputDimensions = EXPORT_PRESETS[outputPreset];
  const selectedDurationMs = mediaInfo?.isGif
    ? Math.max(20, timeline.endMs - timeline.startMs)
    : 0;
  const formatTime = (milliseconds) => `${(milliseconds / 1000).toFixed(1)}s`;

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
    if (!uploadedBlob && !sourceUrl) return undefined;
    let active = true;
    setMediaInfo(null);
    setMediaInfoError("");
    inspectMedia(uploadedBlob || sourceUrl).then((info) => {
      if (!active) return;
      setMediaInfo(info);
      setTimeline((current) => {
        const endMs = current.endMs
          ? Math.min(current.endMs, info.durationMs)
          : info.durationMs;
        return {
          ...current,
          startMs: Math.min(current.startMs, Math.max(0, endMs - 20)),
          endMs,
        };
      });
    }).catch((cause) => {
      if (active) {
        setMediaInfoError(cause instanceof Error ? cause.message : String(cause));
      }
    });
    return () => {
      active = false;
    };
  }, [sourceUrl, uploadedBlob]);

  useEffect(() => {
    setPreviewTimeMs((current) => Math.min(current, selectedDurationMs));
  }, [selectedDurationMs]);

  useEffect(() => {
    if (!outputUrl) return undefined;
    return () => URL.revokeObjectURL(outputUrl);
  }, [outputUrl]);

  useEffect(() => {
    if (!uploadedUrl) return undefined;
    return () => URL.revokeObjectURL(uploadedUrl);
  }, [uploadedUrl]);

  useEffect(() => () => {
    variantItems.forEach((variant) => URL.revokeObjectURL(variant.url));
  }, [variantItems]);

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
        previewTimeMs,
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
  }, [fontSizePercent, outputUrl, previewTimeMs, sourceUrl, strokes, textLayers]);

  function invalidateOutput() {
    setOutputUrl("");
    setOutputBlob(null);
    setVariantItems([]);
    setVariantError("");
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
    setTimeline({ startMs: 0, endMs: 0, speed: 1, reverse: false });
    setVariantItems([]);
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
        timeline,
        outputPreset,
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

  async function getSourceBlob() {
    if (uploadedBlob) return uploadedBlob;
    const response = await fetch(sourceUrl);
    if (!response.ok) throw new Error(`Image request returned HTTP ${response.status}.`);
    return response.blob();
  }

  async function exportProject() {
    try {
      const sourceBlob = await getSourceBlob();
      const blob = await createMemeProject(sourceBlob, {
        textLayers,
        strokes,
        fontSizePercent,
        transform,
        timeline,
        outputPreset,
        gifColorCount,
        gifDithering,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "meme-project.meme";
      link.click();
      globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setProjectFeedback("Portable project downloaded.");
    } catch (cause) {
      setProjectFeedback(`Project could not be exported. ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }

  async function importProject(file) {
    if (!file) return;
    try {
      const project = await readMemeProject(file);
      const { settings } = project;
      setUploadedBlob(project.sourceBlob);
      setUploadedUrl(URL.createObjectURL(project.sourceBlob));
      setTextLayers(settings.textLayers);
      setSelectedTextId(settings.textLayers[0]?.id ?? "top");
      setStrokes(settings.strokes);
      setFontSizePercent(Number(settings.fontSizePercent) || 8);
      setTransform(settings.transform ?? { zoom: 1, brightness: 100, contrast: 100, flipX: false });
      setTimeline(settings.timeline ?? { startMs: 0, endMs: 0, speed: 1, reverse: false });
      setOutputPreset(EXPORT_PRESETS[settings.outputPreset] ? settings.outputPreset : "original");
      setGifColorCount([128, 192, 256].includes(Number(settings.gifColorCount))
        ? Number(settings.gifColorCount)
        : 256);
      setGifDithering(Boolean(settings.gifDithering));
      invalidateOutput();
      setProjectFeedback(`Loaded project from ${file.name}.`);
    } catch (cause) {
      setProjectFeedback(`Project could not be imported. ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }

  async function generateCaptionIdeas() {
    const languageModel = globalThis.LanguageModel ?? globalThis.ai?.languageModel;
    if (typeof languageModel?.create !== "function") {
      setCopilotFeedback("This browser does not expose its built-in on-device AI. Your text stays local; you can enter caption variants below.");
      return;
    }

    setCopilotFeedback("Generating caption ideas on this device…");
    let session;
    try {
      const availability = await languageModel.availability?.();
      if (availability === "unavailable") {
        throw new Error("The browser's on-device model is unavailable.");
      }
      session = await languageModel.create();
      const ideaText = await session.prompt(
        `Suggest four short, distinct meme captions for this idea: "${copilotPrompt.trim() || selectedText?.text || item?.title || "a funny reaction"}". Return only one caption per line, without numbering.`,
      );
      const suggestions = String(ideaText)
        .split(/\n+/)
        .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "").trim())
        .filter(Boolean)
        .slice(0, 4);
      if (!suggestions.length) throw new Error("The on-device model returned no caption ideas.");
      setVariantCaptions(suggestions.join("\n"));
      setCopilotFeedback("Caption ideas generated on-device. Review them before generating variants.");
    } catch (cause) {
      setCopilotFeedback(`On-device caption ideas failed. ${cause instanceof Error ? cause.message : String(cause)}`);
    } finally {
      session?.destroy?.();
    }
  }

  async function generateVariants() {
    const captions = [...new Set(variantCaptions.split("\n").map((line) => line.trim()).filter(Boolean))].slice(0, 4);
    if (captions.length < 2) {
      setVariantError("Enter at least two captions, one per line.");
      return;
    }
    if (!selectedText) {
      setVariantError("Choose a text layer to vary.");
      return;
    }
    setIsGeneratingVariants(true);
    setVariantError("");
    const generated = [];
    try {
      const sourceBlob = await getSourceBlob();
      for (const caption of captions) {
        const layers = textLayers.map((layer) =>
          layer.id === selectedText.id ? { ...layer, text: caption } : layer,
        );
        const blob = await createCaptionedMedia(sourceBlob, {
          textLayers: layers,
          strokes,
          fontSizePercent,
          transform,
          trimStartMs: timeline.startMs,
          trimEndMs: timeline.endMs,
          speed: timeline.speed,
          reverse: timeline.reverse,
          ...(outputDimensions
            ? { outputWidth: outputDimensions.width, outputHeight: outputDimensions.height }
            : {}),
          colorCount: gifColorCount,
          dither: gifDithering,
        });
        generated.push({ caption, blob, url: URL.createObjectURL(blob) });
      }
      setVariantItems(generated);
    } catch (cause) {
      generated.forEach((variant) => URL.revokeObjectURL(variant.url));
      setVariantError(`Variants could not be generated. ${cause instanceof Error ? cause.message : String(cause)}`);
    } finally {
      setIsGeneratingVariants(false);
    }
  }

  function useVariant(variant) {
    setOutputUrl(URL.createObjectURL(variant.blob));
    setOutputBlob(variant.blob);
    setGeneratedFavoriteItem(variant.blob.type === "image/gif" ? {
      id: createGeneratedFavoriteId(),
      title: `Edited ${item?.title || "GIF"}`,
      imageUrl: item?.imageUrl || "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=",
      provider: "meme-editor",
      kind: "gif",
    } : null);
    setIsPreviewOpen(true);
    setOutputActionFeedback(`Selected variant: “${variant.caption}”.`);
  }

  async function suggestFaceSafePlacement() {
    const FaceDetectorApi = globalThis.FaceDetector;
    const image = previewImageRef.current;
    if (typeof FaceDetectorApi !== "function") {
      setFaceFeedback("Face detection is not available in this browser. Drag the selected layer to position it manually.");
      return;
    }
    if (!image?.naturalWidth || !selectedText) {
      setFaceFeedback("Load an image and select a text or sticker layer first.");
      return;
    }
    setIsDetectingFaces(true);
    setFaceFeedback("");
    try {
      const detector = new FaceDetectorApi({ fastMode: true, maxDetectedFaces: 10 });
      const faces = await detector.detect(image);
      if (!faces.length) {
        setFaceFeedback("No faces found. Drag the layer manually or try another frame.");
        return;
      }

      const candidates = [
        { x: 0.5, y: 0.12 },
        { x: 0.5, y: 0.88 },
        { x: 0.5, y: 0.5 },
      ];
      const scoredCandidates = candidates.map((candidate) => {
        const textBox = {
          left: candidate.x - 0.42,
          right: candidate.x + 0.42,
          top: candidate.y - 0.08,
          bottom: candidate.y + 0.08,
        };
        const overlap = faces.reduce((score, face) => {
          const box = face.boundingBox;
          const faceBox = {
            left: box.x / image.naturalWidth,
            right: (box.x + box.width) / image.naturalWidth,
            top: box.y / image.naturalHeight,
            bottom: (box.y + box.height) / image.naturalHeight,
          };
          const width = Math.max(0, Math.min(textBox.right, faceBox.right) - Math.max(textBox.left, faceBox.left));
          const height = Math.max(0, Math.min(textBox.bottom, faceBox.bottom) - Math.max(textBox.top, faceBox.top));
          return score + width * height;
        }, 0);
        return { ...candidate, overlap };
      }).sort((left, right) => left.overlap - right.overlap);
      const placement = scoredCandidates[0];
      updateTextLayer(selectedText.id, {
        x: placement.x,
        y: placement.y,
        position: "custom",
      });
      setFaceFeedback("Suggested a low-overlap position using face detection on this device.");
    } catch (cause) {
      setFaceFeedback(`Face detection failed. ${cause instanceof Error ? cause.message : String(cause)}`);
    } finally {
      setIsDetectingFaces(false);
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
    setTimeline(draft.timeline ?? { startMs: 0, endMs: 0, speed: 1, reverse: false });
    setOutputPreset(draft.outputPreset ?? "original");
    setGifColorCount(draft.gifColorCount);
    setGifDithering(draft.gifDithering);
    setOutputUrl("");
    setOutputBlob(null);
    setVariantItems([]);
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
        trimStartMs: timeline.startMs,
        trimEndMs: timeline.endMs,
        speed: timeline.speed,
        reverse: timeline.reverse,
        ...(outputDimensions
          ? { outputWidth: outputDimensions.width, outputHeight: outputDimensions.height }
          : {}),
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
        <div className="meme-editor-project-tools">
          <button
            className="meme-editor-secondary"
            type="button"
            onClick={exportProject}
            disabled={!sourceUrl && !uploadedBlob}
          >
            Export portable project
          </button>
          <button
            className="meme-editor-secondary"
            type="button"
            onClick={() => projectFileRef.current?.click()}
          >
            Import project
          </button>
          <input
            ref={projectFileRef}
            type="file"
            accept=".meme,application/json,application/vnd.memes.project+json"
            onChange={(event) => {
              void importProject(event.target.files[0]);
              event.target.value = "";
            }}
            hidden
          />
        </div>
        {projectFeedback && <p className="meme-editor-copy-feedback" role="status">{projectFeedback}</p>}
        {drafts.length > 0 && (
          <div className="meme-editor-drafts">
            <strong>Saved drafts</strong>
            {drafts.map((draft) => (
              <div className="meme-editor-draft" key={draft.id}>
                <span>{draft.title}</span>
                <button type="button" onClick={() => loadDraft(draft)}>Load</button>
                <button type="button" onClick={() => removeDraft(draft)} aria-label={`Delete ${draft.title}`}>×</button>
              </div>
            ))}
          </div>
        )}
        {draftFeedback && <p className="meme-editor-copy-feedback" role="status">{draftFeedback}</p>}
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
          style={outputDimensions ? {
            aspectRatio: `${outputDimensions.width} / ${outputDimensions.height}`,
            maxWidth: `min(100%, ${72 * outputDimensions.width / outputDimensions.height}vh)`,
            maxHeight: "72vh",
            minHeight: 0,
            justifySelf: "center",
          } : undefined}
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
              ...(outputDimensions
                ? { width: "100%", height: "100%", maxHeight: "none", objectFit: "cover" }
                : {}),
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
          {outputUrl
            ? "Previewing your generated meme."
            : outputDimensions
              ? "Preview is cropped to the selected export aspect ratio."
              : "Caption preview updates as you type."}
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
        <div className="meme-editor-project-tools">
          <button
            className="meme-editor-secondary"
            type="button"
            onClick={exportProject}
            disabled={!sourceUrl && !uploadedBlob}
          >
            Export portable project
          </button>
          <button
            className="meme-editor-secondary"
            type="button"
            onClick={() => projectFileRef.current?.click()}
          >
            Import project
          </button>
          <input
            ref={projectFileRef}
            type="file"
            accept=".meme,application/json,application/vnd.memes.project+json"
            onChange={(event) => {
              void importProject(event.target.files[0]);
              event.target.value = "";
            }}
            hidden
          />
        </div>
        {projectFeedback && <p className="meme-editor-copy-feedback" role="status">{projectFeedback}</p>}
        {mediaInfoError && <p className="meme-editor-error" role="status">{mediaInfoError}</p>}
        {mediaInfo?.isGif && (
          <div className="meme-editor-timeline">
            <strong>GIF timeline · {mediaInfo.frameCount} frames · {formatTime(mediaInfo.durationMs)}</strong>
            <label className="meme-editor-field">
              <span>Trim start <strong>{formatTime(timeline.startMs)}</strong></span>
              <input
                type="range"
                min="0"
                max={Math.max(0, timeline.endMs - 20)}
                step="10"
                value={timeline.startMs}
                onChange={(event) => {
                  setTimeline((current) => ({ ...current, startMs: Number(event.target.value) }));
                  invalidateOutput();
                }}
              />
            </label>
            <label className="meme-editor-field">
              <span>Trim end <strong>{formatTime(timeline.endMs)}</strong></span>
              <input
                type="range"
                min={timeline.startMs + 20}
                max={mediaInfo.durationMs}
                step="10"
                value={timeline.endMs || mediaInfo.durationMs}
                onChange={(event) => {
                  setTimeline((current) => ({ ...current, endMs: Number(event.target.value) }));
                  invalidateOutput();
                }}
              />
            </label>
            <label className="meme-editor-field">
              <span>Preview layer timing <strong>{formatTime(previewTimeMs)}</strong></span>
              <input
                type="range"
                min="0"
                max={selectedDurationMs}
                step="10"
                value={previewTimeMs}
                onChange={(event) => setPreviewTimeMs(Number(event.target.value))}
              />
            </label>
            <div className="meme-editor-timeline-options">
              <label className="meme-editor-field">
                <span>Playback speed</span>
                <select
                  value={timeline.speed}
                  onChange={(event) => {
                    setTimeline((current) => ({ ...current, speed: Number(event.target.value) }));
                    invalidateOutput();
                  }}
                >
                  <option value="0.5">0.5× slower</option>
                  <option value="0.75">0.75×</option>
                  <option value="1">Normal</option>
                  <option value="1.5">1.5×</option>
                  <option value="2">2× faster</option>
                </select>
              </label>
              <label className="meme-editor-draw-toggle">
                <input
                  type="checkbox"
                  checked={timeline.reverse}
                  onChange={(event) => {
                    setTimeline((current) => ({ ...current, reverse: event.target.checked }));
                    invalidateOutput();
                  }}
                />
                Reverse playback
              </label>
            </div>
          </div>
        )}
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
            {mediaInfo?.isGif && (
              <div className="meme-editor-layer-timing">
                <strong>Layer timing within trimmed clip</strong>
                <div>
                  <label className="meme-editor-field">
                    <span>Show from (seconds)</span>
                    <input
                      type="number"
                      min="0"
                      max={(selectedDurationMs / 1000).toFixed(1)}
                      step="0.1"
                      value={((selectedText.startMs ?? 0) / 1000).toFixed(1)}
                      onChange={(event) => updateTextLayer(selectedText.id, {
                        startMs: Math.min(
                          Math.max(0, Number(event.target.value) * 1000),
                          selectedText.endMs ?? selectedDurationMs,
                        ),
                      })}
                    />
                  </label>
                  <label className="meme-editor-field">
                    <span>Hide after (seconds)</span>
                    <input
                      type="number"
                      min="0"
                      max={(selectedDurationMs / 1000).toFixed(1)}
                      step="0.1"
                      value={((selectedText.endMs ?? selectedDurationMs) / 1000).toFixed(1)}
                      onChange={(event) => updateTextLayer(selectedText.id, {
                        endMs: Math.max(
                          selectedText.startMs ?? 0,
                          Math.min(selectedDurationMs, Number(event.target.value) * 1000),
                        ),
                      })}
                    />
                  </label>
                </div>
              </div>
            )}
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
        <div className="meme-editor-copilot">
          <strong>On-device Meme Copilot</strong>
          <label className="meme-editor-field">
            <span>Idea or mood</span>
            <input
              value={copilotPrompt}
              onChange={(event) => setCopilotPrompt(event.target.value)}
              maxLength={180}
              placeholder="e.g. awkward meeting energy"
            />
          </label>
          <button
            className="meme-editor-secondary"
            type="button"
            onClick={generateCaptionIdeas}
            disabled={isGeneratingVariants || isExporting}
          >
            Suggest captions on this device
          </button>
          <small>The browser’s built-in AI is optional and may not be available. Captions are not sent to a server.</small>
          {copilotFeedback && <p className="meme-editor-copy-feedback" role="status">{copilotFeedback}</p>}
        </div>
        <div className="meme-editor-variants">
          <strong>Batch variations</strong>
          <label className="meme-editor-field">
            <span>One caption per line (up to 4)</span>
            <textarea
              value={variantCaptions}
              onChange={(event) => {
                setVariantCaptions(event.target.value);
                setVariantItems([]);
              }}
              maxLength={500}
              placeholder={"When the meeting could have been an email\nMe pretending I understood the assignment"}
            />
          </label>
          <button
            className="meme-editor-secondary"
            type="button"
            onClick={generateVariants}
            disabled={isGeneratingVariants || isExporting}
          >
            {isGeneratingVariants ? "Generating variations…" : "Generate variations"}
          </button>
          {variantError && <p className="meme-editor-error" role="alert">{variantError}</p>}
          {variantItems.length > 0 && (
            <div className="meme-editor-variant-grid">
              {variantItems.map((variant) => (
                <article key={variant.caption}>
                  <img src={variant.url} alt={variant.caption} />
                  <p>{variant.caption}</p>
                  <button
                    className="meme-editor-secondary"
                    type="button"
                    onClick={() => useVariant(variant)}
                  >
                    Use this version
                  </button>
                </article>
              ))}
            </div>
          )}
        </div>
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
            onClick={suggestFaceSafePlacement}
            disabled={isDetectingFaces || !selectedText}
          >
            {isDetectingFaces ? "Detecting faces…" : "Suggest face-safe placement"}
          </button>
          {faceFeedback && <p className="meme-editor-copy-feedback" role="status">{faceFeedback}</p>}
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
        <div className="meme-editor-export-preset">
          <strong>Export format</strong>
          <label className="meme-editor-field">
            <span>Canvas size</span>
            <select
              value={outputPreset}
              onChange={(event) => {
                setOutputPreset(event.target.value);
                invalidateOutput();
              }}
            >
              {Object.entries(EXPORT_PRESETS).map(([key, preset]) => (
                <option key={key} value={key}>
                  {preset?.label ?? `Original · ${mediaInfo?.width ?? "source"}×${mediaInfo?.height ?? "source"}`}
                </option>
              ))}
            </select>
          </label>
          <small>Preset exports center-crop to fill the selected aspect ratio.</small>
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
          <>
            <div className="meme-editor-output-actions">
              <button className="meme-editor-secondary" type="button" onClick={downloadMeme}>
                Download {outputBlob.type === "image/gif" ? "GIF" : "PNG"}
              </button>
              <button className="meme-editor-secondary" type="button" onClick={shareMeme}>
                Share meme
              </button>
            </div>
            <p className="meme-editor-export-info" role="status">
              {outputDimensions?.width ?? mediaInfo?.width ?? "?"} × {outputDimensions?.height ?? mediaInfo?.height ?? "?"}
              {" · "}{(outputBlob.size / 1024).toFixed(1)} KB · {outputBlob.type === "image/gif" ? "Animated GIF" : "PNG image"}
            </p>
          </>
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
