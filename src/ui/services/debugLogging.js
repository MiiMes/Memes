import { PROVIDER_NAMES, REACTIONS_BY_PROVIDER } from "../constants/appConstants.js";
import { reactionKey } from "../utils/searchTerms.js";

export function logTrendingSearchResults(results, locale) {
  const giphyResult = results.giphy ?? { items: [] };
  const tenorResult = results.tenor ?? { items: [] };
  const giphyTerms = (giphyResult.items ?? []).map((term) => term.query || term.title);
  const tenorTerms = (tenorResult.items ?? []).map((term) => term.query || term.title);
  const normalize = (term) => String(term).trim().replace(/\s+/g, " ").toLowerCase();
  const tenorTermSet = new Set(tenorTerms.map(normalize));
  const overlapByTerm = new Map();

  for (const term of giphyTerms) {
    const key = normalize(term);
    if (key && tenorTermSet.has(key)) overlapByTerm.set(key, term);
  }

  console.groupCollapsed(`🔥 Trending searches · ${locale}`);
  console.log(`🟣 GIPHY · ${giphyTerms.length} results`, giphyTerms);
  console.log(`🔵 Tenor · ${tenorTerms.length} results`, tenorTerms);
  console.log(`🤝 Overlap · ${overlapByTerm.size} terms`, [...overlapByTerm.values()]);
  if (giphyResult.error) console.warn(`⚠️ GIPHY request failed: ${giphyResult.error}`);
  if (tenorResult.error) console.warn(`⚠️ Tenor request failed: ${tenorResult.error}`);
  console.groupEnd();
}

export function logReactionResults(results, providers, locale) {
  const reactionTermsByProvider = Object.fromEntries(
    providers.map((provider) => [provider, REACTIONS_BY_PROVIDER[provider] ?? []]),
  );
  const reactionTerms = new Map();

  for (const [provider, terms] of Object.entries(reactionTermsByProvider)) {
    for (const term of terms) {
      const key = reactionKey(term);
      const existing = reactionTerms.get(key);
      if (existing) {
        if (!existing.providers.includes(provider)) existing.providers.push(provider);
      } else {
        reactionTerms.set(key, { term, providers: [provider] });
      }
    }
  }

  const overlap = [...reactionTerms.values()].filter((entry) => entry.providers.length > 1);
  console.groupCollapsed(`🎭 Reaction page results · ${locale}`);
  console.groupCollapsed("🔎 Reaction terms shown");
  for (const [provider, terms] of Object.entries(reactionTermsByProvider)) {
    console.log(
      `${provider === "giphy" ? "🟣" : provider === "tenor" ? "🔵" : "🟠"} ${PROVIDER_NAMES[provider]} · ${terms.length} results`,
      terms,
    );
  }
  console.log(
    `🤝 Overlap · ${overlap.length} terms`,
    overlap.map(({ term, providers: sources }) =>
      `${term} (${sources.map((provider) => PROVIDER_NAMES[provider]).join(" + ")})`,
    ),
  );
  console.groupEnd();

  console.groupCollapsed("🧩 Provider category results used for previews");
  for (const provider of providers) {
    const result = results[provider] ?? { items: [] };
    const categories = result.items ?? [];
    console.log(
      `${PROVIDER_NAMES[provider]} · ${categories.length} categories`,
      categories.map((category) => category.title),
    );
    if (result.error) console.warn(`⚠️ ${PROVIDER_NAMES[provider]} request failed: ${result.error}`);
  }
  console.groupEnd();
  console.groupEnd();
}

export function logExploreResults(results, providers, locale, kind) {
  const categoriesByProvider = Object.fromEntries(
    providers.map((provider) => [
      provider,
      (results[provider]?.items ?? []).map((item) => item.query || item.title).filter(Boolean),
    ]),
  );
  const categoriesByTerm = new Map();

  for (const [provider, terms] of Object.entries(categoriesByProvider)) {
    for (const term of terms) {
      const key = reactionKey(term);
      const existing = categoriesByTerm.get(key);
      if (existing) {
        if (!existing.providers.includes(provider)) existing.providers.push(provider);
      } else {
        categoriesByTerm.set(key, { term, providers: [provider] });
      }
    }
  }

  const overlap = [...categoriesByTerm.values()].filter((entry) => entry.providers.length > 1);
  console.groupCollapsed(`🧭 Explore categories · ${kind} · ${locale}`);
  for (const provider of providers) {
    const result = results[provider] ?? { items: [] };
    const terms = categoriesByProvider[provider];
    const icon = provider === "giphy" ? "🟣" : provider === "tenor" ? "🔵" : "🟠";
    console.log(`${icon} ${PROVIDER_NAMES[provider]} · ${terms.length} results`, terms);
    if (result.error) console.warn(`⚠️ ${PROVIDER_NAMES[provider]} request failed: ${result.error}`);
  }
  console.log(
    `🤝 Overlap · ${overlap.length} categories`,
    overlap.map(({ term, providers: sources }) =>
      `${term} (${sources.map((provider) => PROVIDER_NAMES[provider]).join(" + ")})`,
    ),
  );
  console.groupEnd();
}
