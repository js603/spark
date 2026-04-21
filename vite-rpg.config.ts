import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: resolve(__dirname),
  base: "./",
  build: {
    outDir: resolve(__dirname, "examples/open-world-rpg/dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, "examples/open-world-rpg/index.html"),
    },
  },
  resolve: {
    alias: {
      "@sparkjsdev/spark": resolve(__dirname, "dist/spark.module.js"),
      three: resolve(__dirname, "node_modules/three/build/three.module.js"),
    },
  },
  define: {
    sparkLocalAssets: "false",
  },
});
