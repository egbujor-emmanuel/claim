/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  outputFileTracingIncludes: {
    // The universe and depth caches are read at request time, so they must be
    // traced into the serverless bundle.
    "/**": ["./data/cache/**"],
  },
  webpack(config) {
    // src/ uses explicit .js specifiers so the same modules run under tsx and
    // node ESM. Webpack needs to be told those resolve to .ts on disk.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};
