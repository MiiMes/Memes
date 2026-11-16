import { useEffect, useRef, useState } from "react";
import { copyAnimatedGifToClipboard, copyPngToClipboard } from "../services/clipboard.js";
import { createExportPack } from "../services/exportPack.js";
import { deleteMemeDraft, readMemeDrafts, saveMemeDraft } from "../services/favorites.js";
import { MEME_FONTS } from "../constants/memeFonts.js";
import { MemeCollaboration } from "./MemeCollaboration.jsx";
import {
  createCaptionedMedia,
  drawMemeOverlays,
  getVideoOutputDimensions,
  inspectMedia,
  supportsMP4Export,
  supportsWebMExport,
} from "../services/memeEditor.js";
import { createMemeProject, readMemeProject } from "../services/memeProject.js";
import { createMemeShareUrl } from "../services/memeShare.js";
import { removeImageBackground } from "../services/onDeviceAi.js";

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

function getMediaDimensions(media) {
  return {
    width: media?.videoWidth || media?.naturalWidth || 0,
    height: media?.videoHeight || media?.naturalHeight || 0,
  };
}

function getOutputExtension(blob) {
  if (blob?.type === "image/gif") return "gif";
  if (blob?.type === "video/mp4") return "mp4";
  if (blob?.type.startsWith("video/")) return "webm";
  return "png";
}

function seekVideoElement(video, timeSeconds) {
  if (Math.abs(video.currentTime - timeSeconds) < 0.001) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("The video could not seek to a frame for face tracking."));
    };
    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });
    video.currentTime = timeSeconds;
  });
}

export function MemeEditor({
  item,
  initialSettings = null,
  initialFile = null,
  initialDraft = null,
  onClose,
  isFavorite,
  onToggleFavorite,
  favoritesError = "",
  favoriteFonts = [],
  favoriteFontsError = "",
  onToggleFavoriteFont,
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
  const [videoOutputFormat, setVideoOutputFormat] = useState("gif");
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
  const [isExportingPack, setIsExportingPack] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [exportError, setExportError] = useState("");
  const [copyFeedback, setCopyFeedback] = useState(null);
  const [outputUrl, setOutputUrl] = useState("");
  const [outputBlob, setOutputBlob] = useState(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(true);
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
  const [shareLink, setShareLink] = useState("");
  const [shareLinkFeedback, setShareLinkFeedback] = useState("");
  const [fontFeedback, setFontFeedback] = useState("");
  const projectFileRef = useRef(null);
  const autoDraftIdRef = useRef(initialDraft?.id ?? null);
  const autoSaveSequenceRef = useRef(0);
  const draftTitleRef = useRef(initialDraft?.title || item?.title || "");
  const [variantCaptions, setVariantCaptions] = useState("");
  const [variantItems, setVariantItems] = useState([]);
  const [isGeneratingVariants, setIsGeneratingVariants] = useState(false);
  const [variantError, setVariantError] = useState("");
  const [copilotPrompt, setCopilotPrompt] = useState("");
  const [copilotFeedback, setCopilotFeedback] = useState("");
  const [faceFeedback, setFaceFeedback] = useState("");
  const [isDetectingFaces, setIsDetectingFaces] = useState(false);
  const [isRemovingBackground, setIsRemovingBackground] = useState(false);
  const [backgroundFeedback, setBackgroundFeedback] = useState("");
  const previewRef = useRef(null);
  const previewImageRef = useRef(null);
  const captionCanvasRef = useRef(null);
  const pointerActionRef = useRef(null);
  const sourceUrl = uploadedUrl || item?.imageUrl || "";
  const selectedText = textLayers.find((layer) => layer.id === selectedTextId);
  const outputDimensions = EXPORT_PRESETS[outputPreset];
  const displayOutputDimensions = outputDimensions ?? (mediaInfo?.isVideo
    ? getVideoOutputDimensions(mediaInfo.width, mediaInfo.height)
    : null);
  const selectedDurationMs = mediaInfo?.isGif || mediaInfo?.isVideo
    ? Math.max(20, timeline.endMs - timeline.startMs)
    : 0;
  const selectedExportLabel = mediaInfo?.isVideo
    ? videoOutputFormat === "gif" ? "GIF" : videoOutputFormat.toUpperCase()
    : "image";
  const formatTime = (milliseconds) => `${(milliseconds / 1000).toFixed(1)}s`;

  function createDraftRecord(sourceBlob, id) {
    return {
      id,
      title: draftTitleRef.current || uploadedBlob?.name || item?.title || "Untitled meme",
      sourceBlob,
      textLayers,
      strokes,
      fontSizePercent,
      transform,
      timeline,
      outputPreset,
      gifColorCount,
      gifDithering,
      videoOutputFormat,
      updatedAt: Date.now(),
    };
  }

  useEffect(() => {
    let active = true;
    readMemeDrafts().then((savedDrafts) => {
      if (active) {
        setDrafts((current) => {
          const currentIds = new Set(current.map((draft) => draft.id));
          return [
            ...current,
            ...savedDrafts.filter((draft) => !currentIds.has(draft.id)),
          ].sort((left, right) => right.updatedAt - left.updatedAt);
        });
      }
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
    if (!initialSettings) return;
    setTextLayers(initialSettings.textLayers);
    setSelectedTextId(initialSettings.textLayers[0]?.id ?? "top");
    setStrokes(initialSettings.strokes);
    setFontSizePercent(initialSettings.fontSizePercent);
    setTransform(initialSettings.transform);
    setTimeline(initialSettings.timeline);
    setOutputPreset(initialSettings.outputPreset);
    setGifColorCount(initialSettings.gifColorCount);
    setGifDithering(initialSettings.gifDithering);
    setVideoOutputFormat(initialSettings.videoOutputFormat);
    invalidateOutput();
  }, [initialSettings]);

  useEffect(() => {
    if (!uploadedBlob && !sourceUrl) return undefined;
    let active = true;
    setMediaInfo(null);
    setMediaInfoError("");
    inspectMedia(uploadedBlob || sourceUrl).then((info) => {
      if (!active) return;
      setMediaInfo(info);
      setTimeline((current) => {
        const durationMs = info.isVideo
          ? Math.min(info.durationMs, 10_000)
          : info.durationMs;
        const endMs = current.endMs
          ? Math.min(current.endMs, durationMs)
          : durationMs;
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
    if (!mediaInfo || (!uploadedBlob && !sourceUrl)) return undefined;
    const sequence = ++autoSaveSequenceRef.current;
    const timeout = globalThis.setTimeout(async () => {
      try {
        let sourceBlob = uploadedBlob;
        if (!sourceBlob) {
          const response = await fetch(sourceUrl);
          if (!response.ok) throw new Error(`Image request returned HTTP ${response.status}.`);
          sourceBlob = await response.blob();
        }
        if (sequence !== autoSaveSequenceRef.current) return;
        const id = autoDraftIdRef.current ?? createGeneratedFavoriteId().replace("edited-", "draft-");
        autoDraftIdRef.current = id;
        const draft = createDraftRecord(sourceBlob, id);
        await saveMemeDraft(draft);
        if (sequence !== autoSaveSequenceRef.current) return;
        setDrafts((current) => [
          draft,
          ...current.filter((entry) => entry.id !== id),
        ].sort((left, right) => right.updatedAt - left.updatedAt));
        setDraftFeedback("Changes automatically saved in this browser.");
      } catch (cause) {
        if (sequence === autoSaveSequenceRef.current) {
          setDraftFeedback(`Automatic save failed. ${cause instanceof Error ? cause.message : String(cause)}`);
        }
      }
    }, 1000);
    return () => {
      globalThis.clearTimeout(timeout);
      if (autoSaveSequenceRef.current === sequence) autoSaveSequenceRef.current += 1;
    };
  }, [
    fontSizePercent,
    gifColorCount,
    gifDithering,
    mediaInfo,
    outputPreset,
    sourceUrl,
    strokes,
    textLayers,
    timeline,
    transform,
    uploadedBlob,
    videoOutputFormat,
  ]);

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

  useEffect(() => {
    if (!initialFile) return;
    setExportError("");
    if (
      initialFile.name?.toLocaleLowerCase().endsWith(".meme") ||
      initialFile.type === "application/vnd.memes.project+json"
    ) {
      void importProject(initialFile);
    } else {
      useUploadedFile(initialFile);
    }
  }, [initialFile]);

  useEffect(() => {
    if (initialDraft) loadDraft(initialDraft);
  }, [initialDraft]);

  useEffect(() => () => {
    variantItems.forEach((variant) => URL.revokeObjectURL(variant.url));
  }, [variantItems]);

  useEffect(() => {
    if (outputUrl) return undefined;

    function renderCaptionPreview() {
      const preview = previewRef.current;
      const media = previewImageRef.current;
      const canvas = captionCanvasRef.current;
      const { width, height } = getMediaDimensions(media);
      if (!preview || !width || !height || !canvas) return;

      const pixelRatio = globalThis.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(media.offsetWidth * pixelRatio));
      canvas.height = Math.max(1, Math.round(media.offsetHeight * pixelRatio));
      canvas.style.left = `${media.offsetLeft}px`;
      canvas.style.top = `${media.offsetTop}px`;
      canvas.style.width = `${media.offsetWidth}px`;
      canvas.style.height = `${media.offsetHeight}px`;

      const context = canvas.getContext("2d");
      if (!context) return;
      context.scale(canvas.width / width, canvas.height / height);
      drawMemeOverlays(
        context,
        textLayers,
        strokes,
        width,
        height,
        fontSizePercent,
        mediaInfo?.isVideo
          ? Math.max(0, media.currentTime * 1000 - timeline.startMs)
          : previewTimeMs,
      );
    }

    const media = previewImageRef.current;
    media?.addEventListener("load", renderCaptionPreview);
    media?.addEventListener("loadeddata", renderCaptionPreview);
    media?.addEventListener("timeupdate", renderCaptionPreview);
    renderCaptionPreview();

    const observer = typeof globalThis.ResizeObserver === "function"
      ? new globalThis.ResizeObserver(renderCaptionPreview)
      : null;
    if (previewRef.current) observer?.observe(previewRef.current);
    if (media) observer?.observe(media);
    if (!observer) globalThis.addEventListener("resize", renderCaptionPreview);

    return () => {
      media?.removeEventListener("load", renderCaptionPreview);
      media?.removeEventListener("loadeddata", renderCaptionPreview);
      media?.removeEventListener("timeupdate", renderCaptionPreview);
      observer?.disconnect();
      if (!observer) globalThis.removeEventListener("resize", renderCaptionPreview);
    };
  }, [fontSizePercent, mediaInfo?.isVideo, outputUrl, previewTimeMs, sourceUrl, strokes, textLayers, timeline.startMs]);

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

  function applyCollaboratorSettings(settings) {
    setTextLayers(settings.textLayers);
    setSelectedTextId(settings.textLayers[0]?.id ?? "top");
    setStrokes(settings.strokes);
    setFontSizePercent(settings.fontSizePercent);
    setTransform(settings.transform);
    setTimeline(settings.timeline);
    setOutputPreset(settings.outputPreset);
    setGifColorCount(settings.gifColorCount);
    setGifDithering(settings.gifDithering);
    setVideoOutputFormat(settings.videoOutputFormat);
    invalidateOutput();
  }

  async function removeBackground() {
    if (!mediaInfo || mediaInfo.isVideo || mediaInfo.isGif) {
      setBackgroundFeedback("Background removal currently supports still images only.");
      return;
    }
    setIsRemovingBackground(true);
    setBackgroundFeedback("Loading the quantized on-device model; first use downloads it from Hugging Face…");
    try {
      const sourceBlob = await getSourceBlob();
      const cutout = await removeImageBackground(sourceBlob, (progress) => {
        if (progress.status === "progress" && Number.isFinite(progress.progress)) {
          setBackgroundFeedback(`Preparing the local model… ${Math.round(progress.progress)}%`);
        }
      });
      if (cutout.size > 20 * 1024 * 1024) {
        throw new Error("The generated transparent PNG is too large to load into the editor.");
      }
      useUploadedFile(new File([cutout], "background-removed.png", { type: "image/png" }));
      setBackgroundFeedback("Transparent PNG cutout created locally and loaded into the editor.");
    } catch (cause) {
      setBackgroundFeedback(`Background removal failed. ${cause instanceof Error ? cause.message : String(cause)}`);
    } finally {
      setIsRemovingBackground(false);
    }
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

  function addPositionKeyframe() {
    if (!selectedText) return;
    const timeMs = Math.max(0, Math.min(selectedDurationMs, previewTimeMs));
    const currentKeyframes = selectedText.keyframes ?? [];
    if (currentKeyframes.length >= 60 && !currentKeyframes.some((entry) => entry.timeMs === timeMs)) {
      setFaceFeedback("This layer already has the maximum of 60 position keyframes.");
      return;
    }
    const keyframe = {
      timeMs,
      x: selectedText.x ?? 0.5,
      y: selectedText.y ?? (selectedText.position === "top" ? 0.08 : 0.92),
    };
    setTextLayers((current) => current.map((layer) => layer.id === selectedText.id
      ? {
          ...layer,
          position: "custom",
          keyframes: [
            ...(layer.keyframes ?? []).filter((entry) => entry.timeMs !== timeMs),
            keyframe,
          ].sort((left, right) => left.timeMs - right.timeMs),
        }
      : layer));
    invalidateOutput();
  }

  function toggleVideoPreview() {
    const video = previewImageRef.current;
    if (!mediaInfo?.isVideo || !video) return;
    if (video.paused) {
      video.play().catch((cause) => {
        setMediaInfoError(`Video preview could not play. ${cause instanceof Error ? cause.message : String(cause)}`);
      });
    } else {
      video.pause();
    }
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
    if (event.target === previewImageRef.current && mediaInfo?.isVideo) return;
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
      .map((layer) => {
        const { width, height } = getMediaDimensions(previewImageRef.current);
        return {
          layer,
          distance: Math.hypot(
            (point.x - (layer.x ?? 0.5)) * (width || 1),
            (point.y - (layer.y ?? (layer.position === "top" ? 0.08 : 0.92))) *
              (height || 1),
          ),
        };
      })
      .filter(({ distance }) => distance < Math.max(
        45,
        (getMediaDimensions(previewImageRef.current).width || 1) * 0.12,
      ))
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
    const supportedTypes = new Set([
      "image/gif", "image/jpeg", "image/png", "image/webp",
      "video/mp4", "video/webm", "video/ogg", "video/quicktime",
    ]);
    if (!supportedTypes.has(file.type)) {
      setExportError("Choose a GIF, JPEG, PNG, WebP, MP4, WebM, Ogg, or QuickTime video.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setExportError("This media file is too large to edit in the browser (20 MB maximum).");
      return;
    }

    autoDraftIdRef.current = null;
    draftTitleRef.current = file.name || item?.title || "Untitled meme";
    setUploadedBlob(file);
    setUploadedUrl(URL.createObjectURL(file));
    setTimeline({ startMs: 0, endMs: 0, speed: 1, reverse: false });
    setVideoOutputFormat("gif");
    setVariantItems([]);
    setOutputUrl("");
    setOutputBlob(null);
    setGeneratedFavoriteItem(null);
    setExportError("");
    setCopyFeedback(null);
    setShareLink("");
    setShareLinkFeedback("");
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
      const id = autoDraftIdRef.current ?? createGeneratedFavoriteId().replace("edited-", "draft-");
      const draft = createDraftRecord(sourceBlob, id);
      await saveMemeDraft(draft);
      autoDraftIdRef.current = id;
      setDrafts((current) => [draft, ...current.filter((entry) => entry.id !== id)]);
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
        videoOutputFormat,
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
      autoDraftIdRef.current = null;
      draftTitleRef.current = project.sourceName || file.name || "Untitled meme";
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
      setVideoOutputFormat(["webm", "mp4"].includes(settings.videoOutputFormat)
        ? settings.videoOutputFormat
        : "gif");
      invalidateOutput();
      setShareLink("");
      setShareLinkFeedback("");
      setProjectFeedback(`Loaded project from ${file.name}.`);
    } catch (cause) {
      setProjectFeedback(`Project could not be imported. ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }

  async function generateCaptionIdeas() {
    const media = previewImageRef.current;
    if (!media) {
      setCopilotFeedback("Load an image or video before asking for visual caption ideas.");
      return;
    }
    const languageModel = globalThis.LanguageModel ?? globalThis.ai?.languageModel;
    if (typeof languageModel?.create !== "function") {
      setCopilotFeedback("This browser does not expose its built-in on-device AI. Your text stays local; you can enter caption variants below.");
      return;
    }

    setCopilotFeedback("Generating caption ideas on this device…");
    let session;
    try {
      const modelOptions = {
        expectedInputs: [
          { type: "text", languages: ["en"] },
          { type: "image" },
        ],
        expectedOutputs: [{ type: "text", languages: ["en"] }],
      };
      const availability = await languageModel.availability?.(modelOptions);
      if (availability === "unavailable") {
        throw new Error("The browser's on-device model does not support image input here.");
      }
      session = await languageModel.create(modelOptions);
      const ideaText = await session.prompt([{
        role: "user",
        content: [
          {
            type: "text",
            value: `Look at this image or video frame and suggest four short, distinct meme captions. Use this optional idea or mood as extra context: "${copilotPrompt.trim() || selectedText?.text || item?.title || "a funny reaction"}". Return only one caption per line, without numbering.`,
          },
          { type: "image", value: media },
        ],
      }]);
      const suggestions = String(ideaText)
        .split(/\n+/)
        .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "").trim())
        .filter(Boolean)
        .slice(0, 4);
      if (!suggestions.length) throw new Error("The on-device model returned no caption ideas.");
      setVariantCaptions(suggestions.join("\n"));
      setCopilotFeedback("Captions generated from the preview on-device. Media was not uploaded; review before generating variants.");
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
          outputFormat: videoOutputFormat,
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
      captionText: variant.caption,
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
    const { width, height } = getMediaDimensions(image);
    if (!width || !selectedText) {
      setFaceFeedback("Load media and select a text or sticker layer first.");
      return;
    }
    setIsDetectingFaces(true);
    setFaceFeedback("");
    const video = mediaInfo?.isVideo ? image : null;
    const wasPlaying = video ? !video.paused : false;
    const originalTime = video?.currentTime ?? 0;
    try {
      const detector = new FaceDetectorApi({ fastMode: true, maxDetectedFaces: 10 });
      if (video) video.pause();
      const sampleCount = video
        ? Math.min(11, Math.max(2, Math.ceil(selectedDurationMs / 1000) + 1))
        : 1;
      const trackedPositions = [];
      const candidates = [
        { x: 0.5, y: 0.12 },
        { x: 0.5, y: 0.88 },
        { x: 0.5, y: 0.5 },
      ];

      for (let index = 0; index < sampleCount; index += 1) {
        const timeMs = sampleCount === 1
          ? 0
          : Math.min(
              Math.max(0, selectedDurationMs - 1),
              Math.round((selectedDurationMs * index) / (sampleCount - 1)),
            );
        if (video) {
          await seekVideoElement(video, (timeline.startMs + timeMs) / 1000);
        }
        const faces = await detector.detect(image);
        if (!faces.length) continue;

        const placement = candidates.map((candidate) => {
          const textBox = {
            left: candidate.x - 0.42,
            right: candidate.x + 0.42,
            top: candidate.y - 0.08,
            bottom: candidate.y + 0.08,
          };
          const overlap = faces.reduce((score, face) => {
            const box = face.boundingBox;
            const faceBox = {
              left: box.x / width,
              right: (box.x + box.width) / width,
              top: box.y / height,
              bottom: (box.y + box.height) / height,
            };
            const overlapWidth = Math.max(
              0,
              Math.min(textBox.right, faceBox.right) - Math.max(textBox.left, faceBox.left),
            );
            const overlapHeight = Math.max(
              0,
              Math.min(textBox.bottom, faceBox.bottom) - Math.max(textBox.top, faceBox.top),
            );
            return score + overlapWidth * overlapHeight;
          }, 0);
          return { ...candidate, overlap };
        }).sort((left, right) => left.overlap - right.overlap)[0];
        trackedPositions.push({ timeMs, x: placement.x, y: placement.y });
      }

      if (!trackedPositions.length) {
        setFaceFeedback("No faces found. Drag the layer manually or try another frame.");
        return;
      }

      updateTextLayer(selectedText.id, {
        x: trackedPositions[0].x,
        y: trackedPositions[0].y,
        position: "custom",
        ...(video ? { keyframes: trackedPositions } : {}),
      });
      setFaceFeedback(video
        ? `Tracked a face-safe caption position across ${trackedPositions.length} sampled video frames on this device.`
        : "Suggested a low-overlap position using face detection on this device.");
    } catch (cause) {
      setFaceFeedback(`Face detection failed. ${cause instanceof Error ? cause.message : String(cause)}`);
    } finally {
      if (video) {
        try {
          await seekVideoElement(video, originalTime);
          if (wasPlaying) await video.play();
        } catch (cause) {
          setFaceFeedback(`Face tracking finished, but video preview could not be restored. ${cause instanceof Error ? cause.message : String(cause)}`);
        }
      }
      setIsDetectingFaces(false);
    }
  }

  function loadDraft(draft) {
    autoDraftIdRef.current = draft.id;
    draftTitleRef.current = draft.title;
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
    setVideoOutputFormat(["webm", "mp4"].includes(draft.videoOutputFormat)
      ? draft.videoOutputFormat
      : "gif");
    setOutputUrl("");
    setOutputBlob(null);
    setVariantItems([]);
    setGeneratedFavoriteItem(null);
    setDraftFeedback(`Loaded “${draft.title}”.`);
  }

  async function removeDraft(draft) {
    try {
      await deleteMemeDraft(draft.id);
      if (autoDraftIdRef.current === draft.id) autoDraftIdRef.current = null;
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
        outputFormat: videoOutputFormat,
      });
      setOutputUrl(URL.createObjectURL(blob));
      setOutputBlob(blob);
      setGeneratedFavoriteItem(blob.type === "image/gif" ? {
        id: createGeneratedFavoriteId(),
        title: `Edited ${item?.title || "GIF"}`,
        captionText: textLayers.map((layer) => layer.text.trim()).filter(Boolean).join(" "),
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

  async function exportPlatformPack() {
    setIsExportingPack(true);
    setOutputActionFeedback("Rendering platform exports…");
    const entries = [];
    try {
      const sourceBlob = await getSourceBlob();
      const commonSettings = {
        textLayers,
        strokes,
        fontSizePercent,
        transform,
        trimStartMs: timeline.startMs,
        trimEndMs: timeline.endMs,
        speed: timeline.speed,
        reverse: timeline.reverse,
        colorCount: gifColorCount,
        dither: gifDithering,
        outputFormat: videoOutputFormat,
      };
      const presets = [
        ["square", 512, 512],
        ["landscape", 640, 480],
        ["story", 540, 960],
      ];
      const outputDetails = [];
      for (const [index, [name, width, height]] of presets.entries()) {
        setOutputActionFeedback(`Rendering ${name} export (${index + 1} of ${presets.length})…`);
        const blob = await createCaptionedMedia(sourceBlob, {
          ...commonSettings,
          outputWidth: width,
          outputHeight: height,
        });
        const extension = getOutputExtension(blob);
        const filename = `meme-${name}.${extension}`;
        entries.push({ name: filename, blob });
        outputDetails.push({ filename, width, height, type: blob.type, bytes: blob.size });
      }

      const projectBlob = await createMemeProject(sourceBlob, {
        ...commonSettings,
        timeline,
        outputPreset,
        gifColorCount,
        gifDithering,
        videoOutputFormat,
      });
      entries.push({ name: "meme-project.meme", blob: projectBlob });
      entries.push({
        name: "export-manifest.json",
        blob: new Blob([JSON.stringify({
          format: "memes-platform-export",
          generatedAt: new Date().toISOString(),
          outputs: outputDetails,
        }, null, 2)], { type: "application/json" }),
      });
      const pack = await createExportPack(entries);
      const url = URL.createObjectURL(pack);
      const link = document.createElement("a");
      link.href = url;
      link.download = "memes-platform-pack.zip";
      link.click();
      globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setOutputActionFeedback("Platform pack downloaded with square, landscape, story, and editable project files.");
    } catch (cause) {
      setOutputActionFeedback(`Platform pack could not be created. ${cause instanceof Error ? cause.message : String(cause)}`);
    } finally {
      setIsExportingPack(false);
    }
  }

  async function copyMeme() {
    if (!outputBlob || !["image/gif", "image/png"].includes(outputBlob.type)) return;
    setIsCopying(true);
    setCopyFeedback(null);
    try {
      if (outputBlob.type === "image/gif") await copyAnimatedGifToClipboard(outputBlob);
      else await copyPngToClipboard(outputBlob);
      setCopyFeedback({
        tone: "success",
        message: outputBlob.type === "image/gif"
          ? "Animated GIF copied. Paste it into your target app to check support."
          : "Image copied. Paste it into your target app to check support.",
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
    const extension = getOutputExtension(outputBlob);
    const url = URL.createObjectURL(outputBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `meme.${extension}`;
    link.click();
    globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setOutputActionFeedback("Download started.");
  }

  async function saveMemeToFolder() {
    if (!outputBlob || typeof globalThis.showSaveFilePicker !== "function") return;
    const extension = getOutputExtension(outputBlob);
    let writable;
    try {
      const handle = await globalThis.showSaveFilePicker({
        suggestedName: `meme.${extension}`,
        types: [{
          description: "Edited meme",
          accept: { [outputBlob.type]: [`.${extension}`] },
        }],
      });
      writable = await handle.createWritable();
      await writable.write(outputBlob);
      await writable.close();
      setOutputActionFeedback("Meme saved to the selected location.");
    } catch (cause) {
      if (writable) {
        try {
          await writable.abort();
        } catch (abortCause) {
          setOutputActionFeedback(
            `Saving failed and the temporary file could not be closed. ${
              abortCause instanceof Error ? abortCause.message : String(abortCause)
            }`,
          );
          return;
        }
      }
      if (cause instanceof Error && cause.name === "AbortError") return;
      setOutputActionFeedback(`Could not save to the selected location. ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }

  async function shareMeme() {
    if (!outputBlob) return;
    const extension = getOutputExtension(outputBlob);
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

  async function copyEditLink() {
    setShareLinkFeedback("");
    try {
      const url = createMemeShareUrl({
        sourceUrl,
        title: item?.title || uploadedBlob?.name || "Shared meme",
        provider: item?.provider || "local-media",
        settings: {
          textLayers,
          strokes,
          fontSizePercent,
          transform,
          timeline,
          outputPreset,
          gifColorCount,
          gifDithering,
          videoOutputFormat,
        },
      });
      setShareLink(url);
      if (typeof navigator.clipboard?.writeText !== "function") {
        throw new Error("Clipboard access is unavailable. Copy the link from the field below.");
      }
      await navigator.clipboard.writeText(url);
      setShareLinkFeedback("Edit link copied. Anyone with the link can open this edit.");
    } catch (cause) {
      setShareLinkFeedback(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function toggleSelectedFontFavorite() {
    const font = selectedText?.fontFamily ?? MEME_FONTS[0].value;
    if (!onToggleFavoriteFont) return;
    const succeeded = onToggleFavoriteFont(font);
    setFontFeedback(succeeded
      ? favoriteFonts.includes(font)
        ? "Font removed from favorites."
        : "Font saved to favorites on this device."
      : "Favorite font could not be saved.");
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
        <p>Open the editor from a GIF card or upload an image, GIF, or short video.</p>
        <label className="meme-editor-upload">
          <span>Upload image, GIF, or video</span>
          <input
            type="file"
            accept="image/gif,image/jpeg,image/png,image/webp,video/mp4,video/webm,video/ogg,video/quicktime"
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
              entry.type.startsWith("image/") || entry.type.startsWith("video/"),
            ) ?? Array.from(event.clipboardData.items)
              .find((entry) => entry.type.startsWith("image/") || entry.type.startsWith("video/"))
              ?.getAsFile();
            if (file) {
              event.preventDefault();
              useUploadedFile(file);
            }
          }}
          tabIndex={0}
          aria-label="Meme preview. Drag text to reposition it, or drop and paste media here."
        >
          {outputBlob?.type.startsWith("video/") && outputUrl ? (
            <video
              className="meme-editor-generated-video"
              src={outputUrl}
              aria-label={`Generated ${getOutputExtension(outputBlob).toUpperCase()} preview`}
              autoPlay
              loop
              muted
              playsInline
              controls
            />
          ) : mediaInfo?.isVideo && !outputUrl ? (
            <video
              ref={previewImageRef}
              src={sourceUrl}
              aria-label={item?.title || "Video meme preview"}
              autoPlay
              loop
              muted
              playsInline
              onTimeUpdate={(event) => {
                const currentTimeMs = event.currentTarget.currentTime * 1000;
                if (
                  currentTimeMs < timeline.startMs ||
                  (currentTimeMs >= timeline.endMs && timeline.endMs > timeline.startMs)
                ) {
                  event.currentTarget.currentTime = timeline.startMs / 1000;
                  return;
                }
                setPreviewTimeMs(Math.max(0, currentTimeMs - timeline.startMs));
              }}
              onPlay={() => setIsPreviewPlaying(true)}
              onPause={() => setIsPreviewPlaying(false)}
              onClick={toggleVideoPreview}
              style={{
                filter: `brightness(${transform.brightness}%) contrast(${transform.contrast}%)`,
                transform: `scale(${transform.zoom})${transform.flipX ? " scaleX(-1)" : ""}`,
                ...(outputDimensions
                  ? { width: "100%", height: "100%", maxHeight: "none", objectFit: "cover" }
                  : {}),
              }}
            />
          ) : (
            <meta charSet="utf-8">
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
            </meta>
          )}
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
              : mediaInfo?.isVideo
                ? "Video preview plays locally. Trim to 10 seconds or less before creating a GIF."
                : "Caption preview updates as you type."}
        </p>
      </div>
      <form className="meme-editor-controls" onSubmit={createMeme}>
        <div>
          <p className="eyebrow dark-eyebrow">MAKE IT YOURS</p>
          <h2>{item?.title || "Edit meme"}</h2>
        </div>
        <label className="meme-editor-upload">
          <span>Upload or replace image, GIF, or video (up to 20 MB)</span>
          <input
            type="file"
            accept="image/gif,image/jpeg,image/png,image/webp,video/mp4,video/webm,video/ogg,video/quicktime"
            onChange={(event) => {
              useUploadedFile(event.target.files[0]);
              event.target.value = "";
            }}
          />
        </label>
        <button
          className="meme-editor-secondary"
          type="button"
          onClick={removeBackground}
          disabled={!mediaInfo || mediaInfo.isGif || mediaInfo.isVideo || isRemovingBackground}
        >
          {isRemovingBackground ? "Removing background…" : "Remove background"}
        </button>
        <p className="meme-editor-preview-note">
          Still images only. The quantized portrait-matting model downloads on first use; inference stays in this browser.
        </p>
        {backgroundFeedback && (
          <p className="meme-editor-copy-feedback" role="status">{backgroundFeedback}</p>
        )}
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
        <button
          className="meme-editor-secondary"
          type="button"
          onClick={copyEditLink}
          disabled={isExporting}
        >
          Copy edit link
        </button>
        {shareLinkFeedback && <p className="meme-editor-copy-feedback" role="status">{shareLinkFeedback}</p>}
        {shareLink && (
          <label className="meme-editor-field">
            <span>Shareable edit URL (contains the settings and media URL)</span>
            <input
              type="url"
              readOnly
              value={shareLink}
              onFocus={(event) => event.target.select()}
            />
          </label>
        )}
        <MemeCollaboration
          settings={{
            textLayers,
            strokes,
            fontSizePercent,
            transform,
            timeline,
            outputPreset,
            gifColorCount,
            gifDithering,
            videoOutputFormat,
          }}
          onReceiveSettings={applyCollaboratorSettings}
        />
        {mediaInfoError && <p className="meme-editor-error" role="status">{mediaInfoError}</p>}
        {(mediaInfo?.isGif || mediaInfo?.isVideo) && (
          <div className="meme-editor-timeline">
            <strong>
              {mediaInfo.isVideo
                ? `Video timeline · ${formatTime(mediaInfo.durationMs)}`
                : `GIF timeline · ${mediaInfo.frameCount} frames · ${formatTime(mediaInfo.durationMs)}`}
              {mediaInfo.isVideo && mediaInfo.durationMs > 10_000 ? " · export up to 10 seconds" : ""}
            </strong>
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
            {(mediaInfo.isGif || mediaInfo.isVideo) && (
              <label className="meme-editor-field">
                <span>
                  {mediaInfo.isVideo ? "Video playhead" : "Preview layer timing"}
                  {" "}<strong>{formatTime(previewTimeMs)}</strong>
                </span>
                <input
                  type="range"
                  min="0"
                  max={selectedDurationMs}
                  step="10"
                  value={previewTimeMs}
                  onChange={(event) => {
                    const timeMs = Number(event.target.value);
                    setPreviewTimeMs(timeMs);
                    if (mediaInfo.isVideo && previewImageRef.current) {
                      previewImageRef.current.currentTime = (timeline.startMs + timeMs) / 1000;
                    }
                  }}
                />
              </label>
            )}
            {mediaInfo.isVideo && (
              <button
                className="meme-editor-secondary"
                type="button"
                onClick={toggleVideoPreview}
              >
                {isPreviewPlaying ? "Pause video preview" : "Play video preview"}
              </button>
            )}
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
                value={selectedText.fontFamily ?? MEME_FONTS[0].value}
                onChange={(event) => updateTextLayer(selectedText.id, { fontFamily: event.target.value })}
                disabled={isExporting}
              >
                {favoriteFonts.length > 0 && (
                  <optgroup label="Favorite fonts">
                    {MEME_FONTS.filter(({ value }) => favoriteFonts.includes(value)).map(({ value, label }) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="Fonts">
                  {MEME_FONTS.filter(({ value }) => !favoriteFonts.includes(value)).map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </optgroup>
              </select>
            </label>
            <button
              className="meme-editor-secondary"
              type="button"
              onClick={toggleSelectedFontFavorite}
              disabled={!onToggleFavoriteFont}
            >
              {favoriteFonts.includes(selectedText.fontFamily ?? MEME_FONTS[0].value)
                ? "★ Remove favorite font"
                : "☆ Save favorite font"}
            </button>
            {favoriteFontsError && <p className="meme-editor-error" role="status">{favoriteFontsError}</p>}
            {fontFeedback && <p className="meme-editor-copy-feedback" role="status">{fontFeedback}</p>}
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
            {(mediaInfo?.isGif || mediaInfo?.isVideo) && (
              <div className="meme-editor-layer-timing">
                <strong>Layer timing and motion</strong>
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
                <button
                  className="meme-editor-secondary"
                  type="button"
                  onClick={addPositionKeyframe}
                  disabled={isExporting}
                >
                  Add position keyframe at {formatTime(previewTimeMs)}
                </button>
                <small>
                  Position keyframes blend smoothly during export.
                  {selectedText.keyframes?.length
                    ? ` ${selectedText.keyframes.length} keyframe(s) on this layer.`
                    : ""}
                </small>
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
        {selectedText && (
          <>
            <label className="meme-editor-draw-toggle">
              <input
                type="checkbox"
                checked={Boolean(selectedText.shadow)}
                onChange={(event) => updateTextLayer(selectedText.id, { shadow: event.target.checked })}
              />
              Drop shadow
            </label>
            {selectedText.shadow && (
              <div className="meme-editor-style-row">
                <label className="meme-editor-field">
                  <span>Shadow color</span>
                  <input
                    type="color"
                    value={selectedText.shadowColor ?? "#000000"}
                    onChange={(event) => updateTextLayer(selectedText.id, { shadowColor: event.target.value })}
                    disabled={isExporting}
                  />
                </label>
                <label className="meme-editor-field">
                  <span>Shadow blur <strong>{selectedText.shadowBlur ?? 6}px</strong></span>
                  <input
                    type="range"
                    min="0"
                    max="40"
                    value={selectedText.shadowBlur ?? 6}
                    onChange={(event) => updateTextLayer(selectedText.id, { shadowBlur: Number(event.target.value) })}
                    disabled={isExporting}
                  />
                </label>
              </div>
            )}
          </>
        )}
        <div className="meme-editor-copilot">
          <strong>On-device Visual Meme Copilot</strong>
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
            Analyze preview and suggest captions
          </button>
          <small>Uses the browser’s built-in image-capable model when available. The visible media frame stays on this device; no API request is made.</small>
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
                  <meta charSet="utf-8"><img src={variant.url} alt={variant.caption} /></meta>
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
            {isDetectingFaces
              ? "Analyzing frames on this device…"
              : mediaInfo?.isVideo
                ? "Track face-safe position across clip"
                : "Suggest face-safe placement"}
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
          {mediaInfo?.isVideo && (
            <>
              <label className="meme-editor-field">
                <span>Video file format</span>
                <select
                  value={videoOutputFormat}
                  onChange={(event) => {
                    setVideoOutputFormat(event.target.value);
                    invalidateOutput();
                  }}
                >
                  <option value="gif">Animated GIF</option>
                  <option value="webm" disabled={!supportsWebMExport()}>
                    WebM video{supportsWebMExport() ? "" : " · not supported"}
                  </option>
                  <option value="mp4" disabled={!supportsMP4Export()}>
                    MP4 video{supportsMP4Export() ? "" : " · not supported"}
                  </option>
                </select>
              </label>
              <small>
                Video is recorded on-device without audio; MP4 and WebM depend on browser codecs.
                Neither video format supports reverse playback.
                {!supportsWebMExport() && !supportsMP4Export()
                  ? " This browser does not support canvas video recording."
                  : ""}
              </small>
            </>
          )}
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
          <button className="meme-editor-primary" type="submit" disabled={isExporting || isExportingPack}>
            {isExporting
              ? `Creating ${selectedExportLabel}…`
              : `Create ${selectedExportLabel === "image" ? "meme" : selectedExportLabel}`}
          </button>
          <button
            className="meme-editor-secondary"
            type="button"
            onClick={exportPlatformPack}
            disabled={isExporting || isExportingPack}
          >
            {isExportingPack ? "Building platform pack…" : "Export platform pack"}
          </button>
          {["image/gif", "image/png"].includes(outputBlob?.type) && (
            <button
              className="meme-editor-secondary"
              type="button"
              onClick={copyMeme}
              disabled={isCopying}
            >
              {isCopying
                ? "Copying image…"
                : outputBlob.type === "image/gif"
                  ? "Copy animated GIF"
                  : "Copy image"}
            </button>
          )}
        </div>
        {outputBlob && (
          <>
            <div className="meme-editor-output-actions">
              <button className="meme-editor-secondary" type="button" onClick={downloadMeme}>
                Download {getOutputExtension(outputBlob).toUpperCase()}
              </button>
              {typeof globalThis.showSaveFilePicker === "function" && (
                <button className="meme-editor-secondary" type="button" onClick={saveMemeToFolder}>
                  Save to folder…
                </button>
              )}
              <button className="meme-editor-secondary" type="button" onClick={shareMeme}>
                Share meme
              </button>
            </div>
            <p className="meme-editor-export-info" role="status">
              {displayOutputDimensions?.width ?? mediaInfo?.width ?? "?"} × {displayOutputDimensions?.height ?? mediaInfo?.height ?? "?"}
              {" · "}{(outputBlob.size / 1024).toFixed(1)} KB · {
                outputBlob.type === "image/gif"
                  ? "Animated GIF"
                  : outputBlob.type.startsWith("video/")
                    ? `${getOutputExtension(outputBlob).toUpperCase()} video`
                    : "PNG image"
              }
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
                {isExporting
                  ? `Creating your ${selectedExportLabel}…`
                  : "Your generated meme"}
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
                <span>Generating your {selectedExportLabel} with the edited text…</span>
              </div>
            ) : outputUrl && (
              <>
                {outputBlob?.type.startsWith("video/") ? (
                  <video
                    className="meme-editor-dialog-image"
                    src={outputUrl}
                    autoPlay
                    loop
                    muted
                    playsInline
                    controls
                    aria-label={item?.title || `Your edited ${getOutputExtension(outputBlob).toUpperCase()} video`}
                  />
                ) : (
                  <meta charSet="utf-8">
                    <img
                      className="meme-editor-dialog-image"
                      src={outputUrl}
                      alt={item?.title || "Your edited meme"}
                    />
                  </meta>
                )}
                <p className="meme-editor-dialog-note">
                  {outputBlob?.type === "image/gif"
                    ? "Right-click the GIF to copy it, or use the buttons to download or share."
                    : outputBlob?.type.startsWith("video/")
                      ? `${getOutputExtension(outputBlob).toUpperCase()} video has no audio. Download or share the edited clip.`
                      : "Copy, download, or share your edited image."}
                </p>
                {["image/gif", "image/png"].includes(outputBlob?.type) && (
                  <button
                    className="meme-editor-primary meme-editor-dialog-copy"
                    type="button"
                    onClick={copyMeme}
                    disabled={isCopying}
                  >
                      {isCopying
                        ? "Copying image…"
                        : outputBlob.type === "image/gif"
                          ? "Click to Copy GIF"
                          : "Click to Copy Image"}
                  </button>
                )}
                <div className="meme-editor-dialog-actions">
                  <button className="meme-editor-secondary" type="button" onClick={downloadMeme}>
                    Download {getOutputExtension(outputBlob).toUpperCase()}
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
