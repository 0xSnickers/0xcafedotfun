import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ['antd'],
  },
  turbopack: {
    root: process.cwd(),
  },
  allowedDevOrigins: ['127.0.0.1'],
  // Handle webpack issues with external modules
  webpack: (config, { isServer }) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };

    // Handle node modules resolution issues
    config.externals = config.externals || [];
    if (isServer) {
      config.externals.push({
        'pino-pretty': 'pino-pretty'
      });
    }

    return config;
  },
  // Optimize images and fonts
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'fonts.gstatic.com',
      },
    ],
  },
  // Transpile problematic packages
  transpilePackages: ['@ant-design/icons'],
  // Configure output
  output: 'standalone',
};

export default nextConfig;
