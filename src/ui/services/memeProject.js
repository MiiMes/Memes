const MAX_PROJECT_BYTES = 30 * 1024 * 1024;
const SUPPORTED_MEDIA_TYPES = new Set([
  "image/gif", "image/jpeg", "image/png", "image/webp",
  "video/mp4", "video/webm", "video/ogg", "video/quicktime",
]);

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error ?? new Error("The project image could not be read."));
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl) {
  const match = /^data:(image\/(?:gif|jpeg|png|webp)|video\/(?:mp4|webm|ogg|quicktime));base64,([A-Za-z0-9+/=\r\n]+)$/.exec(dataUrl);
  if (!match || !SUPPORTED_MEDIA_TYPES.has(match[1])) {
    throw new Error("The project does not contain supported media.");
  }
  const binary = atob(match[2].replace(/\s/g, ""));
  if (binary.length > MAX_PROJECT_BYTES) throw new Error("The project image is too large to import.");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: match[1] });
}

function boundedNumber(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function normalizeSettings(settings) {
  if (settings.textLayers.length > 40 || settings.strokes.length > 100) {
    throw new Error("The project contains too many editor layers.");
  }
  const textLayers = settings.textLayers.map((layer) => {
    if (!layer || typeof layer.id !== "string" || typeof layer.text !== "string") {
      throw new Error("The project contains an invalid text layer.");
    }
    const keyframes = Array.isArray(layer.keyframes)
      ? layer.keyframes.slice(0, 60).map((keyframe) => ({
          timeMs: boundedNumber(keyframe?.timeMs, 0, 0, 3_600_000),
          x: boundedNumber(keyframe?.x, 0.5, 0, 1),
          y: boundedNumber(keyframe?.y, 0.5, 0, 1),
        }))
      : [];
    return {
      ...layer,
      id: layer.id.slice(0, 100),
      text: layer.text.slice(0, 500),
      ...(Number.isFinite(Number(layer.x)) ? { x: boundedNumber(layer.x, 0.5, 0, 1) } : {}),
      ...(Number.isFinite(Number(layer.y)) ? { y: boundedNumber(layer.y, 0.5, 0, 1) } : {}),
      rotation: boundedNumber(layer.rotation, 0, -180, 180),
      fontSizePercent: boundedNumber(layer.fontSizePercent, undefined, 0, 30),
      shadow: Boolean(layer.shadow),
      shadowColor: /^#[0-9a-f]{6}$/i.test(layer.shadowColor) ? layer.shadowColor : "#000000",
      shadowBlur: boundedNumber(layer.shadowBlur, 6, 0, 40),
      shadowOffsetX: boundedNumber(layer.shadowOffsetX, 2, -40, 40),
      shadowOffsetY: boundedNumber(layer.shadowOffsetY, 3, -40, 40),
      startMs: boundedNumber(layer.startMs, 0, 0, 3_600_000),
      endMs: boundedNumber(layer.endMs, 3_600_000, 0, 3_600_000),
      ...(keyframes.length ? { keyframes } : {}),
    };
  });
  const strokes = settings.strokes.map((stroke) => {
    if (
      !stroke ||
      typeof stroke.color !== "string" ||
      !Array.isArray(stroke.points) ||
      !stroke.points.length ||
      stroke.points.length > 5000
    ) {
      throw new Error("The project contains an invalid drawing layer.");
    }
    return {
      ...stroke,
      color: /^#[0-9a-f]{6}$/i.test(stroke.color) ? stroke.color : "#ff765f",
      widthPercent: boundedNumber(stroke.widthPercent, 0.006, 0.001, 0.05),
      points: stroke.points.map((point) => ({
        x: boundedNumber(point?.x, 0.5, 0, 1),
        y: boundedNumber(point?.y, 0.5, 0, 1),
      })),
    };
  });
  const transform = settings.transform && typeof settings.transform === "object"
    ? {
        zoom: boundedNumber(settings.transform.zoom, 1, 1, 2),
        brightness: boundedNumber(settings.transform.brightness, 100, 50, 150),
        contrast: boundedNumber(settings.transform.contrast, 100, 50, 150),
        flipX: Boolean(settings.transform.flipX),
      }
    : { zoom: 1, brightness: 100, contrast: 100, flipX: false };
  const timeline = settings.timeline && typeof settings.timeline === "object"
    ? {
        startMs: boundedNumber(settings.timeline.startMs, 0, 0, 3_600_000),
        endMs: boundedNumber(settings.timeline.endMs, 0, 0, 3_600_000),
        speed: boundedNumber(settings.timeline.speed, 1, 0.25, 4),
        reverse: Boolean(settings.timeline.reverse),
      }
    : { startMs: 0, endMs: 0, speed: 1, reverse: false };
  return {
    ...settings,
    textLayers,
    strokes,
    fontSizePercent: boundedNumber(settings.fontSizePercent, 8, 5, 24),
    transform,
    timeline,
    gifColorCount: [128, 192, 256].includes(Number(settings.gifColorCount))
      ? Number(settings.gifColorCount)
      : 256,
    gifDithering: Boolean(settings.gifDithering),
    videoOutputFormat: settings.videoOutputFormat === "webm" ? "webm" : "gif",
  };
}

export async function createMemeProject(sourceBlob, settings) {
  if (!(sourceBlob instanceof Blob) || !SUPPORTED_MEDIA_TYPES.has(sourceBlob.type)) {
    throw new Error("Choose supported image, GIF, or video media before exporting a project.");
  }
  if (sourceBlob.size > MAX_PROJECT_BYTES) throw new Error("The project image is too large to export.");
  const payload = {
    format: "memes-project",
    version: 1,
    source: {
      type: sourceBlob.type,
      name: sourceBlob.name || "source",
      dataUrl: await blobToDataUrl(sourceBlob),
    },
    settings,
  };
  return new Blob([JSON.stringify(payload)], { type: "application/vnd.memes.project+json" });
}

export async function readMemeProject(file) {
  if (!(file instanceof Blob) || file.size > MAX_PROJECT_BYTES) {
    throw new Error("Choose a valid project file under 30 MB.");
  }
  let project;
  try {
    project = JSON.parse(await file.text());
  } catch (cause) {
    throw new Error("The project file is not valid JSON.", { cause });
  }
  if (
    project?.format !== "memes-project" ||
    project.version !== 1 ||
    typeof project.source?.dataUrl !== "string" ||
    !Array.isArray(project.settings?.textLayers) ||
    !Array.isArray(project.settings?.strokes) ||
    project.settings.textLayers.some((layer) => !layer || typeof layer !== "object") ||
    project.settings.strokes.some((stroke) => !stroke || typeof stroke !== "object")
  ) {
    throw new Error("This is not a supported Memes project file.");
  }
  const sourceBlob = dataUrlToBlob(project.source.dataUrl);
  if (sourceBlob.type !== project.source.type) {
    throw new Error("The project image type does not match its data.");
  }
  return {
    sourceBlob,
    sourceName: typeof project.source.name === "string" ? project.source.name : "source",
    settings: normalizeSettings(project.settings),
  };
}
