type ZipEntry = { city: string; state: string };

// Access the raw data directly — avoids the index.js wrapper that can behave
// unexpectedly when webpack bundles CommonJS modules with variable shadowing.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const RAW = require('zipcodes/lib/codes') as { codes: Record<string, ZipEntry & Record<string, unknown>> };
const CODE_MAP: Record<string, ZipEntry> = RAW?.codes ?? {};

export function lookupZip(zip: string): ZipEntry | null {
  if (!/^\d{5}$/.test(zip)) return null;
  const r = CODE_MAP[zip];
  if (!r) return null;
  return { city: r.city, state: r.state };
}
