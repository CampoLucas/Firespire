import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // El globo (HTML estático en public/globe) es la portada: "/" se reescribe sin redirigir,
  // así la barra de direcciones queda en "/". El HTML usa rutas absolutas (/globe/...) para
  // que sus assets carguen igual desde "/" y desde /globe/index.html.
  async rewrites() {
    return {
      beforeFiles: [{ source: "/", destination: "/globe/index.html" }],
      afterFiles: [],
      fallback: [],
    };
  },
  // Las rutas de API leen public/artifacts con fs: hay que incluirlo en el trace de las funciones.
  outputFileTracingIncludes: {
    "/api/v1/series": ["./public/artifacts/**/*"],
    "/api/v1/validation": ["./public/artifacts/**/*"],
    "/api/v1/export.csv": ["./public/artifacts/**/*"],
  },
};

export default nextConfig;
