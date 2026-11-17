import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb", // Vercel functions accept at most 4.5 MB; files are parsed in the browser
    },
  },
  transpilePackages: ["motion"],
  webpack: (config) => {
    // transformers.js runs in the browser only; keep its Node backends out of the bundle.
    config.resolve.alias = {
      ...config.resolve.alias,
      sharp$: false,
      "onnxruntime-node$": false,
    };
    return config;
  },
};

export default nextConfig;
