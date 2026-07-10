import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  images: {
    // 🌐 外部のUnsplashの画像URLを表示できるように許可を追加
    domains: ['images.unsplash.com'], 
  },
};

export default nextConfig;
