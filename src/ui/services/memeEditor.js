import { decompressFrames, parseGIF } from "gifuct-js";
import * as gifencModule from "gifenc";

const gifenc = gifencModule.GIFEncoder ? gifencModule : gifencModule.default;
const { GIFEncoder, applyPalette, quantize } = gifenc;
const MAX_GIF_BYTES = 20 * 1024 * 1024;
const MAX_GIF_FRAMES = 120;
const MAX_GIF_PIXELS = 1_500_000;
const MAX_TOTAL_FRAME_PIXELS = 30_000_000;
const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

export function drawCaption(context, text, position, width, height, fontSizePercent, style = {}) {
  const normalizedText = style.uppercase === false ? text.trim() : text.trim().toUpperCase();
  if (!normalizedText) return;

  const fontSize = Math.max(12, Math.min(
    150,
    width * ((style.fontSizePercent ?? fontSizePercent) / 100),
    height * 0.22,
  ));
  const lineHeight = fontSize * 1.08;
  const maxWidth = width * (style.maxWidthPercent ?? 0.92);
  const x = (style.x ?? 0.5) * width;
  const y = style.y == null
    ? null
    : style.y * height;
  context.save();
  context.translate(x, y ?? 0);
  if (style.rotation) context.rotate((style.rotation * Math.PI) / 180);
  context.font = `${style.fontWeight ?? 900} ${fontSize}px ${style.fontFamily ?? 'Impact, "Arial Black", sans-serif'}`;
  context.textAlign = style.align ?? "center";
  context.textBaseline = "middle";
  context.lineJoin = "round";
  context.lineWidth = style.strokeWidth ?? Math.max(2, fontSize * 0.12);
  context.strokeStyle = style.strokeColor ?? "#000";
  context.fillStyle = style.color ?? "#fff";

  const lines = [];
  let line = "";
  for (const word of normalizedText.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);

  const visibleLines = lines.slice(0, 3);
  if (lines.length > visibleLines.length) {
    visibleLines[visibleLines.length - 1] = `${visibleLines.at(-1)}…`;
  }
  const firstY = y != null
    ? -lineHeight * (visibleLines.length - 1) / 2
    : position === "top"
      ? fontSize * 0.72
      : height - fontSize * 0.72 - lineHeight * (visibleLines.length - 1);

  visibleLines.forEach((captionLine, index) => {
    const y = firstY + lineHeight * index;
    if (style.outline !== false) context.strokeText(captionLine, 0, y, maxWidth);
    context.fillText(captionLine, 0, y, maxWidth);
  });
  context.restore();
}

export function drawMemeOverlays(
  context,
  textLayers,
  strokes,
  width,
  height,
  fontSizePercent,
  timeMs = null,
) {
  textLayers.forEach((layer) => {
    if (timeMs !== null && (timeMs < (layer.startMs ?? 0) || timeMs > (layer.endMs ?? Infinity))) return;
    drawCaption(
      context,
      layer.text,
      layer.position ?? "custom",
      width,
      height,
      fontSizePercent,
      layer,
    );
  });

  strokes.forEach((stroke) => {
    context.save();
    context.strokeStyle = stroke.color;
    context.lineWidth = Math.max(1, width * stroke.widthPercent);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(stroke.points[0].x * width, stroke.points[0].y * height);
    if (stroke.points.length === 1) {
      context.lineTo(stroke.points[0].x * width + 0.01, stroke.points[0].y * height);
    }
    stroke.points.slice(1).forEach(({ x, y }) => {
      context.lineTo(x * width, y * height);
    });
    context.stroke();
    context.restore();
  });
}

function drawTransformedSource(context, source, width, height, transform = {}) {
  const zoom = Math.max(1, Math.min(2, Number(transform.zoom) || 1));
  const brightness = Math.max(50, Math.min(150, Number(transform.brightness) || 100));
  const contrast = Math.max(50, Math.min(150, Number(transform.contrast) || 100));
  const sourceWidth = source.naturalWidth || source.width;
  const sourceHeight = source.naturalHeight || source.height;
  const scale = Math.max(width / sourceWidth, height / sourceHeight) * zoom;
  context.save();
  context.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
  context.translate(width / 2, height / 2);
  context.scale(transform.flipX ? -1 : 1, 1);
  context.drawImage(
    source,
    (-sourceWidth * scale) / 2,
    (-sourceHeight * scale) / 2,
    sourceWidth * scale,
    sourceHeight * scale,
  );
  context.restore();
}

function ditherPixels(frameData, width, height) {
  const dithered = new Uint8ClampedArray(frameData);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (BAYER_4X4[y % 4][x % 4] - 7.5) * 2;
      const pixelOffset = (y * width + x) * 4;
      dithered[pixelOffset] += offset;
      dithered[pixelOffset + 1] += offset;
      dithered[pixelOffset + 2] += offset;
    }
  }
  return dithered;
}

function createCanvas(width, height) {
  const canvas = globalThis.document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("This browser cannot render GIF frames for editing.");
  return { canvas, context };
}

async function loadSourceBlob(source) {
  if (source instanceof Blob) return source;
  const response = await fetch(source);
  if (!response.ok) throw new Error(`Image request returned HTTP ${response.status}.`);
  return response.blob();
}

function isGif(bytes) {
  const signature = new TextDecoder().decode(bytes.slice(0, 6));
  return signature === "GIF87a" || signature === "GIF89a";
}

export async function inspectMedia(source) {
  const sourceBlob = await loadSourceBlob(source);
  if (!isGif(await sourceBlob.slice(0, 6).arrayBuffer())) {
    const url = URL.createObjectURL(sourceBlob);
    try {
      const image = new globalThis.Image();
      image.src = url;
      if (typeof image.decode === "function") {
        await image.decode();
      } else {
        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = () => reject(new Error("The image could not be decoded."));
        });
      }
      return {
        isGif: false,
        durationMs: 0,
        frameCount: 1,
        width: image.naturalWidth,
        height: image.naturalHeight,
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  let parsedGif;
  try {
    parsedGif = parseGIF(await sourceBlob.arrayBuffer());
  } catch (cause) {
    throw new Error("The GIF file could not be decoded.", { cause });
  }
  const frames = parsedGif.frames.filter((frame) => frame.image);
  return {
    isGif: true,
    durationMs: frames.reduce(
      (duration, frame) => duration + Math.max(20, Number(frame.gce?.delay || 10) * 10),
      0,
    ),
    frameCount: frames.length,
    width: parsedGif.lsd.width,
    height: parsedGif.lsd.height,
  };
}

async function encodeGif(sourceBlob, captions) {
  if (sourceBlob.size > MAX_GIF_BYTES) {
    throw new Error("This GIF is too large to edit in the browser.");
  }

  const bytes = await sourceBlob.arrayBuffer();
  let parsedGif;
  try {
    parsedGif = parseGIF(bytes);
  } catch (cause) {
    throw new Error("The GIF file could not be decoded.", { cause });
  }

  const { width, height } = parsedGif.lsd;
  const outputWidth = Math.max(1, Math.min(1200, Math.round(captions.outputWidth || width)));
  const outputHeight = Math.max(1, Math.min(1200, Math.round(captions.outputHeight || height)));
  const frameCount = parsedGif.frames.filter((frame) => frame.image).length;
  const totalFramePixels = width * height * frameCount;
  if (
    !width ||
    !height ||
    width * height > MAX_GIF_PIXELS ||
    frameCount === 0 ||
    frameCount > MAX_GIF_FRAMES ||
    totalFramePixels > MAX_TOTAL_FRAME_PIXELS
  ) {
    throw new Error("This GIF is too large or has too many frames to edit in the browser.");
  }

  const frames = decompressFrames(parsedGif, true);
  const base = createCanvas(width, height);
  const output = createCanvas(outputWidth, outputHeight);
  const patch = createCanvas(1, 1);
  const encoder = GIFEncoder();
  const totalDurationMs = frames.reduce((duration, frame) =>
    duration + Math.max(20, frame.delay ?? 100), 0);
  const trimStartMs = Math.max(0, Number(captions.trimStartMs) || 0);
  const trimEndMs = Math.min(
    totalDurationMs,
    Number(captions.trimEndMs) || totalDurationMs,
  );
  if (trimEndMs <= trimStartMs) {
    throw new Error("Choose a timeline range that includes at least one frame.");
  }
  const speed = Math.max(0.25, Math.min(4, Number(captions.speed) || 1));
  const reverse = Boolean(captions.reverse);
  if (reverse && outputWidth * outputHeight * frameCount > 6_000_000) {
    throw new Error("Reverse playback is limited to smaller GIFs to protect browser memory.");
  }
  const reversedFrames = [];
  base.context.fillStyle = "#fff";
  base.context.fillRect(0, 0, width, height);

  let previousFrame = null;
  let restoreFrame = null;
  let elapsedMs = 0;
  let encodedCount = 0;
  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index];
    if (previousFrame?.disposalType === 2) {
      base.context.fillStyle = "#fff";
      base.context.fillRect(
        previousFrame.dims.left,
        previousFrame.dims.top,
        previousFrame.dims.width,
        previousFrame.dims.height,
      );
    } else if (previousFrame?.disposalType === 3 && restoreFrame) {
      base.context.putImageData(restoreFrame, 0, 0);
    }

    const restoreBeforeDraw = frame.disposalType === 3
      ? base.context.getImageData(0, 0, width, height)
      : null;
    patch.canvas.width = frame.dims.width;
    patch.canvas.height = frame.dims.height;
    const patchImage = patch.context.createImageData(frame.dims.width, frame.dims.height);
    patchImage.data.set(frame.patch);
    patch.context.putImageData(patchImage, 0, 0);
    base.context.drawImage(patch.canvas, frame.dims.left, frame.dims.top);

    const frameDelay = Math.max(20, frame.delay ?? 100);
    const frameStartMs = elapsedMs;
    const frameEndMs = elapsedMs + frameDelay;
    elapsedMs = frameEndMs;
    const clippedDelay = Math.max(
      0,
      Math.min(frameEndMs, trimEndMs) - Math.max(frameStartMs, trimStartMs),
    );
    if (!clippedDelay) {
      previousFrame = frame;
      restoreFrame = restoreBeforeDraw;
      continue;
    }

    drawTransformedSource(
      output.context,
      base.canvas,
      outputWidth,
      outputHeight,
      captions.transform,
    );
    drawMemeOverlays(
      output.context,
      captions.textLayers ?? [
        { text: captions.topText, position: "top" },
        { text: captions.bottomText, position: "bottom" },
      ],
      captions.strokes ?? [],
      outputWidth,
      outputHeight,
      captions.fontSizePercent,
      Math.max(0, frameStartMs - trimStartMs),
    );

    const frameData = output.context.getImageData(0, 0, outputWidth, outputHeight).data;
    const delay = Math.max(20, Math.round(clippedDelay / speed));
    if (reverse) {
      reversedFrames.push({ frameData: new Uint8ClampedArray(frameData), delay });
    } else {
      const palette = quantize(frameData, Math.max(2, Math.min(256, captions.colorCount ?? 256)));
      const indexedFrame = applyPalette(
        captions.dither ? ditherPixels(frameData, outputWidth, outputHeight) : frameData,
        palette,
      );
      encoder.writeFrame(indexedFrame, outputWidth, outputHeight, {
        palette,
        delay,
        dispose: 1,
        ...(encodedCount === 0 ? { repeat: 0 } : {}),
      });
    }
    encodedCount += 1;

    previousFrame = frame;
    restoreFrame = restoreBeforeDraw;
    if (index > 0 && index % 4 === 0) {
      await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    }
  }

  if (reverse) {
    reversedFrames.reverse().forEach(({ frameData, delay }, index) => {
      const palette = quantize(frameData, Math.max(2, Math.min(256, captions.colorCount ?? 256)));
      const indexedFrame = applyPalette(
        captions.dither ? ditherPixels(frameData, outputWidth, outputHeight) : frameData,
        palette,
      );
      encoder.writeFrame(indexedFrame, outputWidth, outputHeight, {
        palette,
        delay,
        dispose: 1,
        ...(index === 0 ? { repeat: 0 } : {}),
      });
    });
  }
  if (!encodedCount) throw new Error("The selected timeline range does not include any GIF frames.");
  encoder.finish();
  return new Blob([encoder.bytes()], { type: "image/gif" });
}

async function encodeImage(sourceBlob, captions) {
  if (sourceBlob.size > MAX_GIF_BYTES) {
    throw new Error("This image is too large to edit in the browser.");
  }

  const imageUrl = URL.createObjectURL(sourceBlob);
  try {
    const image = new globalThis.Image();
    image.src = imageUrl;
    if (typeof image.decode === "function") {
      await image.decode();
    } else {
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error("The image could not be decoded."));
      });
    }

    const { naturalWidth: sourceWidth, naturalHeight: sourceHeight } = image;
    const width = Math.max(1, Math.min(1200, Math.round(captions.outputWidth || sourceWidth)));
    const height = Math.max(1, Math.min(1200, Math.round(captions.outputHeight || sourceHeight)));
    if (
      !sourceWidth ||
      !sourceHeight ||
      sourceWidth * sourceHeight > MAX_GIF_PIXELS ||
      width * height > MAX_GIF_PIXELS
    ) {
      throw new Error("This image is too large to edit in the browser.");
    }

    const { canvas, context } = createCanvas(width, height);
    drawTransformedSource(context, image, width, height, captions.transform);
    drawMemeOverlays(
      context,
      captions.textLayers ?? [
        { text: captions.topText, position: "top" },
        { text: captions.bottomText, position: "bottom" },
      ],
      captions.strokes ?? [],
      width,
      height,
      captions.fontSizePercent,
    );
    return await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("The edited image could not be exported."));
      }, "image/png");
    });
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

export async function createCaptionedGif(source, captions) {
  const sourceBlob = await loadSourceBlob(source);
  if (!isGif(await sourceBlob.slice(0, 6).arrayBuffer())) {
    throw new Error("This result is not an animated GIF that the editor can decode.");
  }
  return encodeGif(sourceBlob, captions);
}

export async function createCaptionedMedia(source, captions) {
  const sourceBlob = await loadSourceBlob(source);
  return isGif(await sourceBlob.slice(0, 6).arrayBuffer())
    ? encodeGif(sourceBlob, captions)
    : encodeImage(sourceBlob, captions);
}
