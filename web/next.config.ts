import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Las rutas de API leen public/artifacts con fs: hay que incluirlo en el trace de las funciones.
  outputFileTracingIncludes: {
    "/api/v1/series": ["./public/artifacts/**/*"],
    "/api/v1/validation": ["./public/artifacts/**/*"],
    "/api/v1/export.csv": ["./public/artifacts/**/*"],
  },
};

export default nextConfig;
