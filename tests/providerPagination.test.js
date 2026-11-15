import assert from "node:assert/strict";
import test from "node:test";
import { getNextPageCursor } from "../src/ui/services/providerApi.js";

test("GIPHY pagination advances by offset and stops at total or API limit", () => {
  assert.equal(getNextPageCursor(
    "giphy",
    "search",
    { pagination: { offset: 0, count: 30, total_count: 90 } },
    30,
  ), 30);
  assert.equal(getNextPageCursor(
    "giphy",
    "trending",
    { pagination: { offset: 60, count: 30, total_count: 90 } },
    30,
  ), undefined);
  assert.equal(getNextPageCursor(
    "giphy",
    "search",
    { pagination: { offset: 480, count: 30, total_count: 900 } },
    30,
  ), undefined);
});

test("Tenor pagination returns its opaque next cursor and stops on repeated cursors", () => {
  assert.equal(getNextPageCursor(
    "tenor",
    "trending",
    { next: "opaque-cursor" },
    30,
  ), "opaque-cursor");
  assert.equal(getNextPageCursor(
    "tenor",
    "search",
    { next: "same-cursor" },
    30,
    "same-cursor",
  ), undefined);
  assert.equal(getNextPageCursor("tenor", "search", { next: "" }, 30), undefined);
});

test("KLIPY advances only when another page is available", () => {
  assert.equal(getNextPageCursor(
    "klipy",
    "search",
    { data: { current_page: 1, has_next: true } },
    30,
  ), 2);
  assert.equal(getNextPageCursor(
    "klipy",
    "trending",
    { data: { current_page: 3, has_next: false } },
    30,
  ), undefined);
});
