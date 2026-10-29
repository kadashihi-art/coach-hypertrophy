import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  outputFileTracingIncludes: {
    "/api/**/*": [
      "./research-tecnica-biomecanica-v1.txt",
      "./research-acsm-parq-base-v1.txt",
      "./research-acsm-2026-params-v1.txt",
    ],
    "/**/*": [
      "./research-tecnica-biomecanica-v1.txt",
      "./research-acsm-parq-base-v1.txt",
      "./research-acsm-2026-params-v1.txt",
    ],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async redirects() {
    // Nav 5 abas: rotas antigas → Plano > Calendário / Ajustar
    return [
      { source: "/calendario", destination: "/plano/calendario", permanent: false },
      { source: "/meu-treino", destination: "/plano/ajustar", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          { key: "Content-Type", value: "application/manifest+json" },
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
