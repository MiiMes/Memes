import { decompressFrames, parseGIF } from "gifuct-js";
import * as gifencModule from "gifenc";

const gifenc = gifencModule.GIFEncoder ? gifencModule : gifencModule.default;
const { GIFEncoder, applyPalette, quantize } = gifenc;
const MAX_GIF_BYTES = 20 * 1024 * 1024;
const MAX_GIF_FRAMES = 120;
const MAX_GIF_PIXELS = 1_500_000;
const MAX_TOTAL_FRAME_PIXELS = 30_000_000;
const MAX_VIDEO_CLIP_MS = 10_000;
const VIDEO_FRAME_INTERVAL_MS = 100;
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

export function getVideoOutputDimensions(sourceWidth, sourceHeight, requestedWidth, requestedHeight) {
  if (requestedWidth && requestedHeight) {
    return {
      width: Math.max(1, Math.min(1200, Math.round(requestedWidth))),
      height: Math.max(1, Math.min(1200, Math.round(requestedHeight))),
    };
  }
  const scale = Math.min(
    1,
    1200 / sourceWidth,
    1200 / sourceHeight,
    Math.sqrt(MAX_GIF_PIXELS / (sourceWidth * sourceHeight)),
  );
  return {
    width: Math.max(1, Math.floor(sourceWidth * scale)),
    height: Math.max(1, Math.floor(sourceHeight * scale)),
  };
}

function webmMimeType() {
  const recorder = globalThis.MediaRecorder;
  const candidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  if (typeof recorder?.isTypeSupported !== "function") return "video/webm";
  return candidates.find((mimeType) =>
    recorder.isTypeSupported(mimeType),
  ) ?? "";
}

export function supportsWebMExport() {
  return Boolean(
    typeof globalThis.MediaRecorder === "function" &&
    typeof globalThis.HTMLCanvasElement?.prototype?.captureStream === "function" &&
    webmMimeType(),
  );
}

function layerAtTime(layer, timeMs) {
  const keyframes = Array.isArray(layer.keyframes)
    ? [...layer.keyframes].sort((left, right) => left.timeMs - right.timeMs)
    : [];
  if (timeMs === null || keyframes.length === 0) return layer;

  const before = [...keyframes].reverse().find((keyframe) => keyframe.timeMs <= timeMs);
  const after = keyframes.find((keyframe) => keyframe.timeMs >= timeMs);
  if (!before) return { ...layer, x: after.x, y: after.y, position: "custom" };
  if (!after || after.timeMs === before.timeMs) {
    return { ...layer, x: before.x, y: before.y, position: "custom" };
  }
  const progress = (timeMs - before.timeMs) / (after.timeMs - before.timeMs);
  return {
    ...layer,
    x: before.x + (after.x - before.x) * progress,
    y: before.y + (after.y - before.y) * progress,
    position: "custom",
  };
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
    const positionedLayer = layerAtTime(layer, timeMs);
    drawCaption(
      context,
      layer.text,
      positionedLayer.position ?? "custom",
      width,
      height,
      fontSizePercent,
      positionedLayer,
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
  const sourceWidth = source.videoWidth || source.naturalWidth || source.width;
  const sourceHeight = source.videoHeight || source.naturalHeight || source.height;
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
  if (sourceBlob.type.startsWith("video/")) {
    const url = URL.createObjectURL(sourceBlob);
    try {
      const video = await loadVideo(url);
      return {
        isGif: false,
        isVideo: true,
        durationMs: Math.round(video.duration * 1000),
        frameCount: Math.ceil(video.duration * 1000 / VIDEO_FRAME_INTERVAL_MS),
        width: video.videoWidth,
        height: video.videoHeight,
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
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
        isVideo: false,
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
    isVideo: false,
    durationMs: frames.reduce(
      (duration, frame) => duration + Math.max(20, Number(frame.gce?.delay || 10) * 10),
      0,
    ),
    frameCount: frames.length,
    width: parsedGif.lsd.width,
    height: parsedGif.lsd.height,
  };
}

function loadVideo(url) {
  const video = globalThis.document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("error", onError);
    };
    const onLoaded = () => {
      cleanup();
      if (!Number.isFinite(video.duration) || !video.videoWidth || !video.videoHeight) {
        reject(new Error("This video has invalid dimensions or duration."));
        return;
      }
      resolve(video);
    };
    const onError = () => {
      cleanup();
      reject(new Error("This browser could not decode the selected video."));
    };
    video.addEventListener("loadedmetadata", onLoaded, { once: true });
    video.addEventListener("error", onError, { once: true });
    video.src = url;
    video.load();
  });
}

function seekVideo(video, timeSeconds) {
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
      reject(new Error("The browser could not seek to a video frame."));
    };
    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });
    video.currentTime = timeSeconds;
  });
}

function waitForVideoFrame(video) {
  if (video.readyState >= 2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener("loadeddata", onLoaded);
      video.removeEventListener("error", onError);
    };
    const onLoaded = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("The video frame could not be decoded."));
    };
    video.addEventListener("loadeddata", onLoaded, { once: true });
    video.addEventListener("error", onError, { once: true });
    if (video.readyState >= 2) onLoaded();
  });
}

async function encodeVideo(sourceBlob, captions) {
  if (sourceBlob.size > MAX_GIF_BYTES) {
    throw new Error("This video is too large to edit in the browser.");
  }
  const url = URL.createObjectURL(sourceBlob);
  let video;
  try {
    video = await loadVideo(url);
    const width = video.videoWidth;
    const height = video.videoHeight;
    const { width: outputWidth, height: outputHeight } = getVideoOutputDimensions(
      width,
      height,
      captions.outputWidth,
      captions.outputHeight,
    );
    if (outputWidth * outputHeight > MAX_GIF_PIXELS) {
      throw new Error("This video frame is too large to edit in the browser.");
    }

    async function encodeVideoAsWebM(video, captions) {
      if (!supportsWebMExport()) {
        throw new Error("WebM export requires browser support for canvas capture and MediaRecorder.");
      }
      if (captions.reverse) {
        throw new Error("WebM export does not support reverse playback. Turn off Reverse playback or export as GIF.");
      }

      let stream;
      let animationFrameId = 0;
      let recorder;
      let recordingResult;
      try {
        const { width: outputWidth, height: outputHeight } = getVideoOutputDimensions(
          video.videoWidth,
          video.videoHeight,
          captions.outputWidth,
          captions.outputHeight,
        );
        const durationMs = Math.round(video.duration * 1000);
        const trimStartMs = Math.max(0, Number(captions.trimStartMs) || 0);
        const trimEndMs = Math.min(durationMs, Number(captions.trimEndMs) || durationMs);
        const clipDurationMs = trimEndMs - trimStartMs;
        if (clipDurationMs <= 0) {
          throw new Error("Choose a video timeline range that includes a frame.");
        }
        if (clipDurationMs > MAX_VIDEO_CLIP_MS) {
          throw new Error("WebM export is limited to 10 seconds. Trim the clip and try again.");
        }

        const { canvas, context } = createCanvas(outputWidth, outputHeight);
        if (typeof canvas.captureStream !== "function") {
          throw new Error("This browser cannot capture the edited canvas as video.");
        }
        await waitForVideoFrame(video);
        await seekVideo(video, trimStartMs / 1000);
        drawTransformedSource(context, video, outputWidth, outputHeight, captions.transform);
        drawMemeOverlays(
          context,
          captions.textLayers ?? [
            { text: captions.topText, position: "top" },
            { text: captions.bottomText, position: "bottom" },
          ],
          captions.strokes ?? [],
          outputWidth,
          outputHeight,
          captions.fontSizePercent,
          0,
        );
        stream = canvas.captureStream(15);
        const mimeType = webmMimeType();
        recorder = new globalThis.MediaRecorder(stream, {
          mimeType,
          videoBitsPerSecond: 4_000_000,
        });
        recordingResult = new Promise((resolve, reject) => {
          const chunks = [];
          recorder.addEventListener("dataavailable", (event) => {
            if (event.data.size) chunks.push(event.data);
          });
          recorder.addEventListener("error", (event) => {
            reject(event.error ?? new Error("The browser could not encode this WebM."));
          }, { once: true });
          recorder.addEventListener("stop", () => {
            resolve(new Blob(chunks, { type: recorder.mimeType || mimeType }));
          }, { once: true });
        });
        recordingResult.catch(() => {});
        recorder.start(250);

        video.playbackRate = Math.max(0.25, Math.min(4, Number(captions.speed) || 1));
        const playbackStartedAt = globalThis.performance.now();
        await video.play();
        await new Promise((resolve, reject) => {
          const drawFrame = () => {
            const timeMs = Math.max(0, video.currentTime * 1000 - trimStartMs);
            drawTransformedSource(context, video, outputWidth, outputHeight, captions.transform);
            drawMemeOverlays(
              context,
              captions.textLayers ?? [
                { text: captions.topText, position: "top" },
                { text: captions.bottomText, position: "bottom" },
              ],
              captions.strokes ?? [],
              outputWidth,
              outputHeight,
              captions.fontSizePercent,
              timeMs,
            );
            if (video.currentTime * 1000 >= trimEndMs) {
              video.pause();
              resolve();
              return;
            }
            if (globalThis.performance.now() - playbackStartedAt > clipDurationMs / video.playbackRate + 5000) {
              video.pause();
              reject(new Error("WebM capture timed out before the selected clip finished."));
              return;
            }
            animationFrameId = globalThis.requestAnimationFrame(drawFrame);
          };
          animationFrameId = globalThis.requestAnimationFrame(drawFrame);
        });

        recorder.stop();
        const blob = await recordingResult;
        if (!blob.size) throw new Error("The browser produced an empty WebM file.");
        return blob;
      } catch (cause) {
        if (video && !video.paused) video.pause();
        if (recorder?.state === "recording") {
          recorder.stop();
          await recordingResult?.catch(() => {});
        }
        throw cause;
      } finally {
        if (animationFrameId) globalThis.cancelAnimationFrame(animationFrameId);
        stream?.getTracks().forEach((track) => track.stop());
      }
    }

    if (captions.outputFormat === "webm") {
      return await encodeVideoAsWebM(video, captions);
    }

    const durationMs = Math.round(video.duration * 1000);
    const trimStartMs = Math.max(0, Number(captions.trimStartMs) || 0);
    const trimEndMs = Math.min(durationMs, Number(captions.trimEndMs) || durationMs);
    const clipDurationMs = trimEndMs - trimStartMs;
    if (clipDurationMs <= 0) {
      throw new Error("Choose a video timeline range that includes at least one frame.");
    }
    if (clipDurationMs > MAX_VIDEO_CLIP_MS) {
      throw new Error("Video-to-GIF export is limited to 10 seconds. Trim the clip and try again.");
    }

    const frameCount = Math.max(1, Math.min(
      MAX_GIF_FRAMES,
      Math.ceil(clipDurationMs / VIDEO_FRAME_INTERVAL_MS),
      Math.floor(MAX_TOTAL_FRAME_PIXELS / (outputWidth * outputHeight)),
    ));
    const frameIntervalMs = clipDurationMs / frameCount;
    if (captions.reverse && outputWidth * outputHeight * frameCount > 6_000_000) {
      throw new Error("Reverse playback is limited to smaller video clips to protect browser memory.");
    }

    const { context } = createCanvas(outputWidth, outputHeight);
    const encoder = GIFEncoder();
    const reverseFrames = [];
    const speed = Math.max(0.25, Math.min(4, Number(captions.speed) || 1));
    const colorCount = Math.max(2, Math.min(256, captions.colorCount ?? 256));
    let encodedCount = 0;
    await waitForVideoFrame(video);

    for (let index = 0; index < frameCount; index += 1) {
      const frameTimeMs = Math.min(Math.round(index * frameIntervalMs), clipDurationMs - 1);
      await seekVideo(video, (trimStartMs + frameTimeMs) / 1000);
      drawTransformedSource(
        context,
        video,
        outputWidth,
        outputHeight,
        captions.transform,
      );
      drawMemeOverlays(
        context,
        captions.textLayers ?? [
          { text: captions.topText, position: "top" },
          { text: captions.bottomText, position: "bottom" },
        ],
        captions.strokes ?? [],
        outputWidth,
        outputHeight,
        captions.fontSizePercent,
        frameTimeMs,
      );

      const frameData = context.getImageData(0, 0, outputWidth, outputHeight).data;
      const remainingMs = clipDurationMs - frameTimeMs;
      const delay = Math.max(
        20,
        Math.round(Math.min(frameIntervalMs, remainingMs) / speed),
      );
      if (captions.reverse) {
        reverseFrames.push({ data: new Uint8ClampedArray(frameData), delay });
      } else {
        const palette = quantize(frameData, colorCount);
        encoder.writeFrame(
          applyPalette(captions.dither ? ditherPixels(frameData, outputWidth, outputHeight) : frameData, palette),
          outputWidth,
          outputHeight,
          { palette, delay, dispose: 1, ...(encodedCount === 0 ? { repeat: 0 } : {}) },
        );
      }
      encodedCount += 1;
      if (index > 0 && index % 4 === 0) {
        await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
      }
    }

    if (captions.reverse) {
      reverseFrames.reverse().forEach(({ data, delay }, index) => {
        const palette = quantize(data, colorCount);
        encoder.writeFrame(
          applyPalette(captions.dither ? ditherPixels(data, outputWidth, outputHeight) : data, palette),
          outputWidth,
          outputHeight,
          { palette, delay, dispose: 1, ...(index === 0 ? { repeat: 0 } : {}) },
        );
      });
    }
    if (!encodedCount) throw new Error("The selected video clip did not contain any decodable frames.");
    encoder.finish();
    return new Blob([encoder.bytes()], { type: "image/gif" });
  } finally {
    video?.pause();
    video?.removeAttribute("src");
    video?.load();
    URL.revokeObjectURL(url);
  }
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
  if (sourceBlob.type.startsWith("video/")) {
    return encodeVideo(sourceBlob, captions);
  }
  return isGif(await sourceBlob.slice(0, 6).arrayBuffer())
    ? encodeGif(sourceBlob, captions)
    : encodeImage(sourceBlob, captions);
}
