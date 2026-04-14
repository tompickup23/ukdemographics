import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://ukdemographics.co.uk",
  vite: {
    plugins: [tailwindcss()]
  }
});
