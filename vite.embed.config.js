import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.GITHUB_PAGES === "true" ? "/Memes/" : "/",
  build: {
    outDir: "dist",
    emptyOutDir: false,
    lib: {
      entry: "src/embed.js",
      formats: ["es"],
      fileName: "miimes-search",
    },
  },
});
