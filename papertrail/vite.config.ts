import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base is set to "/PaperTrail/" for production builds (GitHub Pages) and for
// `vite preview`, which serves that build and must use the same base.
// The dev server keeps serving from "/" so localhost:5173 works directly.
export default defineConfig(({ command, isPreview }) => ({
  plugins: [react()],
  base: command === "build" || isPreview ? "/PaperTrail/" : "/",
}));