import { useQuery } from "@tanstack/react-query";
import {
  TENOR_GIF_EXPLORE_CATEGORIES,
  TRENDING_SEARCH_PROVIDERS,
} from "../constants/appConstants.js";
import {
  logExploreResults,
  logReactionResults,
  logTrendingSearchResults,
} from "../services/debugLogging.js";
import { requestProviders } from "../services/providerApi.js";

export function useProviderQueries({
  page,
  providers,
  submittedQuery,
  kind,
  locale,
  apiRunId,
  apiAction,
  apiQuery,
  logRequest,
}) {
  const mediaAction = submittedQuery ? "search" : "trending";
  const mediaQuery = useQuery({
    queryKey: ["media", mediaAction, submittedQuery, kind, locale, providers],
    queryFn: () => requestProviders({
      providers,
      action: mediaAction,
      q: submittedQuery,
      kind,
      locale,
      logRequest,
    }),
    enabled: page === "home",
  });
  const trendingQuery = useQuery({
    queryKey: ["trending-searches", locale],
    queryFn: async () => {
      const results = await requestProviders({
        providers: TRENDING_SEARCH_PROVIDERS,
        action: "trending-searches",
        kind,
        locale,
        logRequest,
      });
      logTrendingSearchResults(results, locale);
      return results;
    },
    enabled: page === "home",
  });
  const categoryKind = page === "reactions" ? "gif" : kind;
  const categoriesQuery = useQuery({
    queryKey: ["categories", page, categoryKind, locale, providers],
    queryFn: async () => {
      const useStaticTenorCategories =
        page === "explore" && kind === "gif" && providers.includes("tenor");
      const results = await requestProviders({
        providers,
        action: "categories",
        kind: categoryKind,
        locale,
        logRequest,
      });
      if (!useStaticTenorCategories) {
        if (page === "reactions") logReactionResults(results, providers, locale);
        if (page === "explore") logExploreResults(results, providers, locale, kind);
        return results;
      }

      const tenorCategories = results.tenor?.items ?? [];
      const categoryKey = (value) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const exploreResults = {
        ...results,
        tenor: {
          ...results.tenor,
          items: TENOR_GIF_EXPLORE_CATEGORIES.map((title, index) => {
            const key = categoryKey(title);
            const preview = tenorCategories.find((category) =>
              [category.title, category.query].some((value) => categoryKey(value) === key),
            );
            return {
              id: `tenor-explore-${index}`,
              title,
              query: title,
              imageUrl: preview?.imageUrl ?? "",
              provider: "tenor",
              kind: "gif",
            };
          }),
        },
      };
      logExploreResults(exploreResults, providers, locale, kind);
      return exploreResults;
    },
    enabled: page === "explore" || page === "reactions",
  });
  const apiQueryResult = useQuery({
    queryKey: ["api-console", apiRunId, apiAction, apiQuery, kind, locale, providers],
    queryFn: () => requestProviders({
      providers,
      action: apiAction,
      q: apiQuery.trim(),
      kind,
      locale,
      logRequest,
    }),
    enabled: page === "api" && apiRunId > 0,
  });

  return { mediaQuery, trendingQuery, categoriesQuery, apiQueryResult };
}
