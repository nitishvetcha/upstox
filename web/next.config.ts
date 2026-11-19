import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Owner-authorised (stage C): do not advertise the framework.
  poweredByHeader: false,
  // Lets a verification build go to a separate folder so the live runner's .next is never replaced mid-session.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
