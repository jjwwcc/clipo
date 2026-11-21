import { defineConfig } from "cf/config";

export default defineConfig({
  worker: {
    name: "clipo",
    compatibilityDate: "2026-11-20",
    domains: ["clipo.ondarlin.com"],
  },
});
