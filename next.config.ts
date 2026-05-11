import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  webpack: (config, { isServer }) => {
    if (isServer) {
      // HeyGen/LiveKit SDK uses browser-only APIs
      // These packages should not be bundled for server-side rendering
      config.externals = config.externals || []
      if (Array.isArray(config.externals)) {
        config.externals.push(
          '@heygen/streaming-avatar',
          'livekit-client',
          'webrtc-issue-detector',
        )
      }
    }
    return config
  },
}

export default nextConfig
