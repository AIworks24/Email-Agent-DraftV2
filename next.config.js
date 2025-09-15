/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Allow build to complete with some warnings
    serverComponentsExternalPackages: ['@azure/msal-node']
  },
  eslint: {
    // Allow production builds to complete even with ESLint errors
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Allow production builds to complete even with type errors
    ignoreBuildErrors: true,
  }
}

module.exports = nextConfig