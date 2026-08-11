import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// If you deploy under a sub-path (e.g. GitHub Pages project site),
// set base to "/your-repo-name/". For a root domain, leave it as "/".
export default defineConfig({
  base: "/",
  plugins: [react()],
});
