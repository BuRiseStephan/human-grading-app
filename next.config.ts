import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the database clients out of the bundle (native/optional bindings).
  serverExternalPackages: ["@libsql/client", "better-sqlite3"],
};

export default nextConfig;
