import { join } from "node:path";

/**
 * Cache locations.
 *
 * These must resolve under two different runtimes: tsx, where the source file
 * sits on disk, and the Next production server, where the module has been
 * bundled into a chunk somewhere else entirely. `import.meta.url` is relative to
 * the bundle in the second case, so a path built from it points nowhere.
 *
 * process.cwd() is the project root under both `npm run <script>` and
 * `next start`, so everything hangs off that instead.
 */
export const CACHE_DIR = join(process.cwd(), "data", "cache");
export const UNIVERSE_PATH = join(CACHE_DIR, "universe.json");
export const DEPTH_PATH = join(CACHE_DIR, "depth.json");
export const PYTH_FEEDS_PATH = join(CACHE_DIR, "pythfeeds.json");
