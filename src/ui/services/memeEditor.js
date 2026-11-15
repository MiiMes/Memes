import { decompressFrames, parseGIF } from "gifuct-js";
import * as gifencModule from "gifenc";

const gifenc = gifencModule.GIFEncoder ? gifencModule : gifencModule.default;
const { GIFEncoder, applyPalette, quantize } = gifenc;
const MAX_GIF_BYTES = 20 * 1024 * 1024;
const MAX_GIF_FRAMES = 120;
const MAX_GIF_PIXELS = 1_500_000;
const MAX_TOTAL_FRAME_PIXELS = 30_000_000;

function drawCaption(context, text, position, width, height, fontSizePercent) {
  const normalizedText = text.trim().toUpperCase();
  if (!normalizedText) return;

  const fontSize = Math.max(
    12,
    Math.min(150, width * (fontSizePercent / 100), height * 0.22),
  );
  const lineHeight = fontSize * 1.08;
  const maxWidth = width * 0.92;
  context.font = `900 ${fontSize}px Impact, "Arial Black", sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.lineJoin = "round";
  context.lineWidth = Math.max(2, fontSize * 0.12);
  context.strokeStyle = "#000";
  context.fillStyle = "#fff";

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
  const firstY = position === "top"
    ? fontSize * 0.72
    : height - fontSize * 0.72 - lineHeight * (visibleLines.length - 1);

  visibleLines.forEach((captionLine, index) => {
    const y = firstY + lineHeight * index;
    context.strokeText(captionLine, width / 2, y, maxWidth);
    context.fillText(captionLine, width / 2, y, maxWidth);
  });
}

function createCanvas(width, height) {
  const canvas = globalThis.document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("This browser cannot render GIF frames for editing.");
  return { canvas, context };
}

export async function createCaptionedGif(imageUrl, captions) {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`GIF request returned HTTP ${response.status}.`);
  const sourceBlob = await response.blob();
  if (sourceBlob.size > MAX_GIF_BYTES) {
    throw new Error("This GIF is too large to edit in the browser.");
  }

  const bytes = await sourceBlob.arrayBuffer();
  const signature = new TextDecoder().decode(bytes.slice(0, 6));
  if (signature !== "GIF87a" && signature !== "GIF89a") {
    throw new Error("This result is not an animated GIF that the editor can decode.");
  }

  let parsedGif;
  try {
    parsedGif = parseGIF(bytes);
  } catch (cause) {
    throw new Error("The GIF file could not be decoded.", { cause });
  }

  const { width, height } = parsedGif.lsd;
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
  const output = createCanvas(width, height);
  const patch = createCanvas(1, 1);
  const encoder = GIFEncoder();
  base.context.fillStyle = "#fff";
  base.context.fillRect(0, 0, width, height);

  let previousFrame = null;
  let restoreFrame = null;
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

    output.context.drawImage(base.canvas, 0, 0);
    drawCaption(output.context, captions.topText, "top", width, height, captions.fontSizePercent);
    drawCaption(output.context, captions.bottomText, "bottom", width, height, captions.fontSizePercent);

    const frameData = output.context.getImageData(0, 0, width, height).data;
    const palette = quantize(frameData, 256);
    const indexedFrame = applyPalette(frameData, palette);
    encoder.writeFrame(indexedFrame, width, height, {
      palette,
      delay: Math.max(20, Math.round(frame.delay ?? 100)),
      dispose: 1,
      ...(index === 0 ? { repeat: 0 } : {}),
    });

    previousFrame = frame;
    restoreFrame = restoreBeforeDraw;
    if (index > 0 && index % 4 === 0) {
      await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    }
  }

  encoder.finish();
  return new Blob([encoder.bytes()], { type: "image/gif" });
}
