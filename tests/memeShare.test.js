import assert from "node:assert/strict";
import test from "node:test";
import { createMemeShareUrl, readMemeShareFromHash } from "../src/ui/services/memeShare.js";

const settings = {
  textLayers: Array.from({ length: 20 }, (_, index) => ({
    id: `caption-${index}`,
    label: "Caption",
    text: "A deliberately repetitive caption for checking compression",
    position: "custom",
    x: 0.4,
    y: 0.6,
    keyframes: [{ timeMs: 200, x: 0.2, y: 0.8 }],
  })),
  strokes: [{
    id: "stroke",
    color: "#ff765f",
    widthPercent: 0.006,
    points: [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }],
  }],
  fontSizePercent: 8,
  transform: { zoom: 1.2, brightness: 110, contrast: 95, flipX: true },
  timeline: { startMs: 100, endMs: 900, speed: 1.5, reverse: false },
  outputPreset: "square",
  gifColorCount: 192,
  gifDithering: true,
  videoOutputFormat: "gif",
};

test("compressed share links round-trip all bounded editor settings", () => {
  const url = createMemeShareUrl({
    sourceUrl: "https://media.example.test/source.gif",
    title: "Shared edit",
    provider: "test",
    settings,
  }, "https://miimes.example.test/Memes/");
  const opened = readMemeShareFromHash(new URL(url).hash);

  assert.equal(opened.error, "");
  assert.equal(opened.item.title, "Shared edit");
  assert.equal(opened.item.imageUrl, "https://media.example.test/source.gif");
  assert.equal(opened.settings.textLayers[0].text, settings.textLayers[0].text);
  assert.deepEqual(opened.settings.textLayers[0].keyframes, settings.textLayers[0].keyframes);
  assert.deepEqual(opened.settings.strokes, settings.strokes);
  assert.deepEqual(opened.settings.transform, settings.transform);
  assert.ok(url.includes("share=lz1."));
});

test("share reader continues to open legacy base64url links", () => {
  const payload = {
    version: 1,
    sourceUrl: "https://media.example.test/legacy.gif",
    title: "Legacy edit",
    provider: "test",
    settings,
  };
  const token = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const opened = readMemeShareFromHash(`#/editor?share=${token}`);

  assert.equal(opened.error, "");
  assert.equal(opened.item.title, "Legacy edit");
  assert.equal(opened.settings.outputPreset, "square");
});

test("compressed share links preserve the MP4 export preference", () => {
  const url = createMemeShareUrl({
    sourceUrl: "https://media.example.test/source.mp4",
    title: "Video edit",
    provider: "test",
    settings: { ...settings, videoOutputFormat: "mp4" },
  }, "https://miimes.example.test/Memes/");
  const opened = readMemeShareFromHash(new URL(url).hash);

  assert.equal(opened.error, "");
  assert.equal(opened.settings.videoOutputFormat, "mp4");
});
