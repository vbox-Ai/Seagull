import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 渲染进程用相对基址：打包后 Electron 以 file:// 加载 dist/index.html。
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    assetsInlineLimit: 0,
  },
  server: {
    port: 5273,
    strictPort: true,
  },
});
