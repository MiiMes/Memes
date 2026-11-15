import { useCallback, useEffect, useState } from "react";
import { readPage } from "../utils/routes.js";

export function useHashRoute() {
  const [page, setPage] = useState(readPage);

  useEffect(() => {
    const onHashChange = () => setPage(readPage());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigate = useCallback((nextPage) => {
    const nextHash = nextPage === "home" ? "#/" : "#/" + nextPage;
    if (window.location.hash === nextHash) setPage(nextPage);
    else window.location.hash = nextHash;
  }, []);

  return { page, navigate };
}
