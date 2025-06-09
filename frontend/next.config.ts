import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ['antd'],
  },
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
    domains: ['fonts.gstatic.com'],
  },
  // Transpile problematic packages
  transpilePackages: ['@ant-design/icons'],
  // Configure output
  output: 'standalone',
};

export default nextConfig;
