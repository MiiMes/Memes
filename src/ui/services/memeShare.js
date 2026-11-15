import { MEME_FONT_FAMILIES } from "../constants/memeFonts.js";

const MAX_SHARE_LENGTH = 12_000;
const MAX_TEXT_LAYERS = 40;
const MAX_STROKES = 100;
const MAX_STROKE_POINTS = 20_000;
const OUTPUT_PRESETS = new Set(["original", "square", "landscape", "portrait", "story"]);

function boundedNumber(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function encodeBase64Url(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64Url(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function normalizeTextLayer(layer) {
  if (!layer || typeof layer.id !== "string" || typeof layer.text !== "string") {
    throw new Error("The shared meme contains an invalid text layer.");
  }
  const keyframes = Array.isArray(layer.keyframes)
    ? layer.keyframes.slice(0, 60).map((keyframe) => ({
        timeMs: boundedNumber(keyframe?.timeMs, 0, 0, 3_600_000),
        x: boundedNumber(keyframe?.x, 0.5, 0, 1),
        y: boundedNumber(keyframe?.y, 0.5, 0, 1),
      }))
    : [];
  return {
    id: layer.id.slice(0, 100),
    label: typeof layer.label === "string" ? layer.label.slice(0, 100) : "Text",
    text: layer.text.slice(0, 100),
    kind: layer.kind === "sticker" ? "sticker" : "text",
    position: ["top", "bottom", "custom"].includes(layer.position) ? layer.position : "custom",
    x: boundedNumber(layer.x, 0.5, 0, 1),
    y: boundedNumber(layer.y, layer.position === "top" ? 0.08 : 0.92, 0, 1),
    fontFamily: MEME_FONT_FAMILIES.has(layer.fontFamily) ? layer.fontFamily : 'Impact, "Arial Black", sans-serif',
    fontWeight: boundedNumber(layer.fontWeight, 900, 100, 900),
    fontSizePercent: boundedNumber(layer.fontSizePercent, 8, 5, 24),
    uppercase: layer.uppercase !== false,
    outline: layer.outline !== false,
    shadow: Boolean(layer.shadow),
    shadowColor: /^#[0-9a-f]{6}$/i.test(layer.shadowColor) ? layer.shadowColor : "#000000",
    shadowBlur: boundedNumber(layer.shadowBlur, 6, 0, 40),
    shadowOffsetX: boundedNumber(layer.shadowOffsetX, 2, -40, 40),
    shadowOffsetY: boundedNumber(layer.shadowOffsetY, 3, -40, 40),
    color: /^#[0-9a-f]{6}$/i.test(layer.color) ? layer.color : "#ffffff",
    strokeColor: /^#[0-9a-f]{6}$/i.test(layer.strokeColor) ? layer.strokeColor : "#000000",
    strokeWidth: boundedNumber(layer.strokeWidth, 10, 1, 30),
    align: ["left", "center", "right"].includes(layer.align) ? layer.align : "center",
    rotation: boundedNumber(layer.rotation, 0, -180, 180),
    startMs: boundedNumber(layer.startMs, 0, 0, 3_600_000),
    endMs: boundedNumber(layer.endMs, 3_600_000, 0, 3_600_000),
    ...(keyframes.length ? { keyframes } : {}),
  };
}

function normalizeSettings(settings) {
  if (
    !settings ||
    !Array.isArray(settings.textLayers) ||
    settings.textLayers.length > MAX_TEXT_LAYERS ||
    !Array.isArray(settings.strokes) ||
    settings.strokes.length > MAX_STROKES
  ) {
    throw new Error("The shared meme settings are invalid or too large.");
  }
  let pointCount = 0;
  const strokes = settings.strokes.map((stroke) => {
    if (!stroke || !Array.isArray(stroke.points) || !stroke.points.length) {
      throw new Error("The shared meme contains an invalid drawing layer.");
    }
    pointCount += stroke.points.length;
    if (pointCount > MAX_STROKE_POINTS) {
      throw new Error("The shared meme contains too much drawing data.");
    }
    return {
      id: typeof stroke.id === "string" ? stroke.id.slice(0, 100) : "stroke",
      color: /^#[0-9a-f]{6}$/i.test(stroke.color) ? stroke.color : "#ff765f",
      widthPercent: boundedNumber(stroke.widthPercent, 0.006, 0.001, 0.05),
      points: stroke.points.map((point) => ({
        x: boundedNumber(point?.x, 0.5, 0, 1),
        y: boundedNumber(point?.y, 0.5, 0, 1),
      })),
    };
  });
  const transform = settings.transform ?? {};
  const timeline = settings.timeline ?? {};
  return {
    textLayers: settings.textLayers.map(normalizeTextLayer),
    strokes,
    fontSizePercent: boundedNumber(settings.fontSizePercent, 8, 5, 24),
    transform: {
      zoom: boundedNumber(transform.zoom, 1, 1, 2),
      brightness: boundedNumber(transform.brightness, 100, 50, 150),
      contrast: boundedNumber(transform.contrast, 100, 50, 150),
      flipX: Boolean(transform.flipX),
    },
    timeline: {
      startMs: boundedNumber(timeline.startMs, 0, 0, 3_600_000),
      endMs: boundedNumber(timeline.endMs, 0, 0, 3_600_000),
      speed: boundedNumber(timeline.speed, 1, 0.25, 4),
      reverse: Boolean(timeline.reverse),
    },
    outputPreset: OUTPUT_PRESETS.has(settings.outputPreset) ? settings.outputPreset : "original",
    gifColorCount: [128, 192, 256].includes(Number(settings.gifColorCount))
      ? Number(settings.gifColorCount)
      : 256,
    gifDithering: Boolean(settings.gifDithering),
    videoOutputFormat: settings.videoOutputFormat === "webm" ? "webm" : "gif",
  };
}

export function createMemeShareUrl({ sourceUrl, title, provider, settings }, currentUrl = globalThis.location.href) {
  let source;
  try {
    source = new URL(sourceUrl);
  } catch {
    throw new Error("A public HTTPS image URL is required to create a share link.");
  }
  if (source.protocol !== "https:" || source.username || source.password) {
    throw new Error("Only public HTTPS media can be shared in a link. Use a project file for local uploads.");
  }
  const payload = {
    version: 1,
    sourceUrl: source.href,
    title: typeof title === "string" ? title.slice(0, 100) : "Shared meme",
    provider: typeof provider === "string" ? provider.slice(0, 40) : "shared-link",
    settings: normalizeSettings(settings),
  };
  const token = encodeBase64Url(JSON.stringify(payload));
  const shareUrl = new URL(currentUrl);
  shareUrl.hash = `#/editor?share=${token}`;
  if (shareUrl.href.length > MAX_SHARE_LENGTH) {
    throw new Error("This edit is too detailed for a share link. Export a portable project instead.");
  }
  return shareUrl.href;
}

export function readMemeShareFromHash(hash = globalThis.location?.hash ?? "") {
  const params = new URLSearchParams(hash.split("?").slice(1).join("?"));
  const token = params.get("share");
  if (!token) return { item: null, settings: null, error: "" };
  try {
    if (token.length > MAX_SHARE_LENGTH) throw new Error("This share link is too large.");
    const payload = JSON.parse(decodeBase64Url(token));
    if (payload?.version !== 1 || typeof payload.sourceUrl !== "string") {
      throw new Error("This share link is not a supported meme edit.");
    }
    const source = new URL(payload.sourceUrl);
    if (source.protocol !== "https:" || source.username || source.password) {
      throw new Error("The share link must use a public HTTPS media URL.");
    }
    return {
      item: {
        id: `shared-${source.href}`,
        title: typeof payload.title === "string" ? payload.title.slice(0, 100) : "Shared meme",
        imageUrl: source.href,
        provider: typeof payload.provider === "string" ? payload.provider.slice(0, 40) : "shared-link",
        kind: "gif",
      },
      settings: normalizeSettings(payload.settings),
      error: "",
    };
  } catch (cause) {
    return {
      item: null,
      settings: null,
      error: `Shared meme could not be opened. ${cause instanceof Error ? cause.message : String(cause)}`,
    };
  }
}
