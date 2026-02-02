import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 将 ali-oss 及其依赖标记为服务端外部包
  serverExternalPackages: ['ali-oss'],
};

export default nextConfig;
