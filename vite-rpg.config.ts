import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: resolve(__dirname, "examples/open-world-rpg"),
  base: "/spark/rpg/",
  build: {
    outDir: resolve(__dirname, "dist-rpg"),
    emptyOutDir: true,
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
