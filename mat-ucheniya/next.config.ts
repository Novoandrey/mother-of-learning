import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-hosting (spec-023): emit a standalone server bundle so the
  // Docker runner image stays small. Build runs on the box via Dokploy.
  output: "standalone",
};

export default nextConfig;
