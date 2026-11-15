const BACKGROUND_MODEL = "Xenova/modnet";
const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
const MAX_SEMANTIC_ITEMS = 500;
const SEMANTIC_BATCH_SIZE = 24;

let transformersPromise;
let backgroundPipelinePromise;
let embeddingPipelinePromise;

function loadTransformers() {
  transformersPromise ??= import("@huggingface/transformers");
  return transformersPromise;
}

async function getPipeline(type, model, onProgress) {
  const { pipeline } = await loadTransformers();
  const key = type === "background-removal" ? "background" : "embedding";
  const existing = key === "background" ? backgroundPipelinePromise : embeddingPipelinePromise;
  const pending = existing ?? pipeline(type, model, {
    progress_callback: onProgress,
  });
  if (key === "background") backgroundPipelinePromise = pending;
  else embeddingPipelinePromise = pending;
  try {
    return await pending;
  } catch (cause) {
    if (key === "background" && backgroundPipelinePromise === pending) {
      backgroundPipelinePromise = null;
    }
    if (key === "embedding" && embeddingPipelinePromise === pending) {
      embeddingPipelinePromise = null;
    }
    throw cause;
  }
}

export async function removeImageBackground(blob, onProgress) {
  if (!(blob instanceof Blob) || !blob.type.startsWith("image/")) {
    throw new Error("Choose a still image to remove its background.");
  }
  if (blob.size > 20 * 1024 * 1024) {
    throw new Error("The image must be 20 MB or smaller for background removal.");
  }

  const [{ RawImage }, remover] = await Promise.all([
    loadTransformers(),
    getPipeline("background-removal", BACKGROUND_MODEL, onProgress),
  ]);
  const source = await RawImage.fromBlob(blob);
  const output = await remover(source);
  const cutout = await output[0]?.toBlob();
  if (!(cutout instanceof Blob) || cutout.type !== "image/png" || !cutout.size) {
    throw new Error("The background-removal model did not return a transparent PNG.");
  }
  return cutout;
}

function searchableDescription(item) {
  return [
    item.title,
    item.provider,
    item.captionText,
    ...(item.tags ?? []),
    ...(item.textLayers ?? []).map((layer) => layer.text),
  ].filter(Boolean).join(" ").slice(0, 500);
}

function cosineSimilarity(left, right) {
  let score = 0;
  for (let index = 0; index < left.length; index += 1) {
    score += left[index] * right[index];
  }
  return score;
}

export async function rankLocalLibrary(query, entries, onProgress) {
  const cleanQuery = query.trim();
  if (!cleanQuery) throw new Error("Enter a phrase to search by meaning.");
  if (!Array.isArray(entries) || !entries.length) return { matches: [], omittedCount: 0 };

  const boundedEntries = entries.slice(0, MAX_SEMANTIC_ITEMS);
  const extractor = await getPipeline("feature-extraction", EMBEDDING_MODEL, onProgress);
  const queryOutput = await extractor(cleanQuery, { pooling: "mean", normalize: true });
  const queryVector = queryOutput.tolist()[0];
  const matches = [];

  for (let offset = 0; offset < boundedEntries.length; offset += SEMANTIC_BATCH_SIZE) {
    const batch = boundedEntries.slice(offset, offset + SEMANTIC_BATCH_SIZE);
    const descriptions = batch.map(searchableDescription);
    const output = await extractor(descriptions, { pooling: "mean", normalize: true });
    const vectors = output.tolist();
    batch.forEach((entry, index) => {
      matches.push({ ...entry, score: cosineSimilarity(queryVector, vectors[index]) });
    });
    onProgress?.({
      status: "indexing",
      completed: Math.min(offset + batch.length, boundedEntries.length),
      total: boundedEntries.length,
    });
  }

  matches.sort((left, right) => right.score - left.score);
  return {
    matches: matches.filter((entry) => entry.score >= 0.2).slice(0, 50),
    omittedCount: entries.length - boundedEntries.length,
  };
}
