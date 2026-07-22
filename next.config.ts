import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the database clients out of the bundle (native/optional bindings).
  serverExternalPackages: ["@libsql/client", "better-sqlite3"],
  // Allows building to an alternate output dir for isolated testing; defaults
  // to .next, so cloud builds (Vercel) are unaffected.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
