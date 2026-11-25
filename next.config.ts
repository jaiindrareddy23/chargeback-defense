import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* This app is an always-fresh internal dashboard with no static content,
   * so Cache Components' prerendering model buys nothing here — using the
   * simpler previous caching model instead. */
};

export default nextConfig;
