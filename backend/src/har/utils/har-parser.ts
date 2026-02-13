/**
 * HAR File Parser
 *
 * Parses HAR (HTTP Archive) files and filters out irrelevant entries
 * to minimize token usage when querying the LLM.
 */

export interface HarFile {
  log: {
    version: string;
    creator: { name: string; version: string };
    entries: HarEntry[];
  };
}

export interface HarEntry {
  startedDateTime: string;
  time: number;
  request: {
    method: string;
    url: string;
    httpVersion: string;
    headers: Array<{ name: string; value: string }>;
    queryString: Array<{ name: string; value: string }>;
    postData?: { mimeType: string; text: string; params?: Array<{ name: string; value: string }> };
    headersSize: number;
    bodySize: number;
  };
  response: {
    status: number;
    statusText: string;
    httpVersion: string;
    headers: Array<{ name: string; value: string }>;
    content: { size: number; mimeType: string; text?: string };
    redirectURL: string;
    headersSize: number;
    bodySize: number;
  };
  cache: Record<string, unknown>;
  timings: { send: number; wait: number; receive: number };
}

export interface CompactEntry {
  index: number;
  method: string;
  url: string;
  status: number;
  responseType: string;
  responseSize: number;
}

/** MIME types for static assets — these are never the API we're looking for */
const STATIC_ASSET_TYPES = [
  'text/html',
  'text/css',
  'text/javascript',
  'application/javascript',
  'application/x-javascript',
  'image/',
  'font/',
  'audio/',
  'video/',
  'application/font',
  'application/x-font',
  'application/woff',
  'application/octet-stream',
];

/** URL patterns for static assets */
const STATIC_ASSET_EXTENSIONS = [
  '.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico',
  '.woff', '.woff2', '.ttf', '.eot', '.map', '.webp', '.avif',
];

/** Known tracking / analytics domains to filter out */
const TRACKING_DOMAINS = [
  'google-analytics.com', 'googletagmanager.com', 'doubleclick.net',
  'facebook.com', 'facebook.net', 'fbcdn.net',
  'analytics', 'tracking', 'pixel', 'beacon',
  'hotjar.com', 'segment.com', 'mixpanel.com',
  'sentry.io', 'newrelic.com', 'datadoghq.com',
];

/**
 * Parse a raw HAR JSON string into a structured HarFile.
 */
export function parseHarFile(rawContent: string): HarFile {
  try {
    const parsed = JSON.parse(rawContent);
    if (!parsed?.log?.entries) {
      throw new Error('Invalid HAR file: missing log.entries');
    }
    return parsed as HarFile;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('Invalid HAR file: not valid JSON');
    }
    throw error;
  }
}

/**
 * Check if a response MIME type indicates a static asset.
 */
function isStaticAssetType(mimeType: string): boolean {
  const lower = mimeType.toLowerCase();
  return STATIC_ASSET_TYPES.some((type) => lower.includes(type));
}

/**
 * Check if a URL points to a static asset based on file extension.
 */
function isStaticAssetUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return STATIC_ASSET_EXTENSIONS.some((ext) => pathname.endsWith(ext));
  } catch {
    return false;
  }
}

/**
 * Check if a URL belongs to a known tracking/analytics domain.
 */
function isTrackingDomain(url: string): boolean {
  const lower = url.toLowerCase();
  return TRACKING_DOMAINS.some((domain) => lower.includes(domain));
}

/**
 * Filter HAR entries to keep only potential API calls.
 * This is the key pre-processing step for token efficiency.
 *
 * Strategy:
 * 1. Remove entries with HTML responses (assignment says target API doesn't return HTML)
 * 2. Remove static assets (images, CSS, JS, fonts)
 * 3. Remove known tracking/analytics requests
 * 4. Remove redirects (3xx) and failures that are likely not the target
 * 5. Keep JSON/XML/plain-text API responses
 */
export interface FilterBreakdown {
  html: number;
  staticAssetMime: number;
  staticAssetUrl: number;
  tracking: number;
  dataBlob: number;
  redirects: number;
  options: number;
}

export function filterEntries(entries: HarEntry[]): {
  filtered: HarEntry[];
  stats: { total: number; removed: number; kept: number };
  breakdown: FilterBreakdown;
} {
  const breakdown: FilterBreakdown = {
    html: 0,
    staticAssetMime: 0,
    staticAssetUrl: 0,
    tracking: 0,
    dataBlob: 0,
    redirects: 0,
    options: 0,
  };

  const filtered = entries.filter((entry) => {
    const { request, response } = entry;
    const mimeType = response.content.mimeType || '';
    const url = request.url;

    // Skip HTML responses — assignment says target API is not returning HTML
    if (mimeType.includes('text/html')) { breakdown.html++; return false; }

    // Skip static assets by MIME type
    if (isStaticAssetType(mimeType)) { breakdown.staticAssetMime++; return false; }

    // Skip static assets by URL extension
    if (isStaticAssetUrl(url)) { breakdown.staticAssetUrl++; return false; }

    // Skip tracking/analytics domains
    if (isTrackingDomain(url)) { breakdown.tracking++; return false; }

    // Skip data: URLs and blob: URLs
    if (url.startsWith('data:') || url.startsWith('blob:')) { breakdown.dataBlob++; return false; }

    // Skip redirects (they're not the final API call)
    if (response.status >= 300 && response.status < 400) { breakdown.redirects++; return false; }

    // Skip preflight OPTIONS requests
    if (request.method === 'OPTIONS') { breakdown.options++; return false; }

    return true;
  });

  return {
    filtered,
    stats: {
      total: entries.length,
      removed: entries.length - filtered.length,
      kept: filtered.length,
    },
    breakdown,
  };
}

/**
 * Strip large response/request bodies from entries to reduce memory usage.
 * We only need the request details (for curl generation) and metadata.
 * This is critical for large HAR files (50MB+).
 */
export function stripBodies(entries: HarEntry[]): HarEntry[] {
  return entries.map((entry) => ({
    ...entry,
    request: {
      ...entry.request,
      // Keep postData for curl generation, but truncate if very large
      postData: entry.request.postData
        ? {
            ...entry.request.postData,
            text: entry.request.postData.text?.substring(0, 10000) || '',
          }
        : undefined,
    },
    response: {
      ...entry.response,
      content: {
        ...entry.response.content,
        // Drop response body entirely — we never need it
        text: undefined,
      },
    },
  }));
}

/**
 * Create a compact representation of entries for display and LLM context.
 */
export function toCompactEntries(entries: HarEntry[]): CompactEntry[] {
  return entries.map((entry, index) => ({
    index,
    method: entry.request.method,
    url: entry.request.url,
    status: entry.response.status,
    responseType: entry.response.content.mimeType || 'unknown',
    responseSize: entry.response.content.size || 0,
  }));
}

/**
 * Normalize a URL: extract base path and query parameter names (drop values).
 */
function normalizeUrl(url: string): { base: string; paramNames: string[] } {
  try {
    const parsed = new URL(url);
    const paramNames = Array.from(parsed.searchParams.keys()).sort();
    return { base: `${parsed.origin}${parsed.pathname}`, paramNames };
  } catch {
    return { base: url, paramNames: [] };
  }
}

/**
 * Build a deduplication key from an entry: method + base URL + sorted param names.
 * Entries with the same key are effectively the same API endpoint called multiple times.
 */
function getDeduplicationKey(entry: CompactEntry): string {
  const { base, paramNames } = normalizeUrl(entry.url);
  return `${entry.method} ${base} ?${paramNames.join('&')}`;
}

export interface LlmSummaryResult {
  summary: string;
  uniquePatterns: number;
  originalEntries: number;
}

/**
 * Create a deduplicated, compact summary of entries for the LLM prompt.
 *
 * Token efficiency optimizations (when deduplicate = true):
 * 1. Deduplication — same method + path + param names → single line with [xN] count
 * 2. URL compaction — strip query param VALUES, keep only param NAMES
 * 3. One line per unique pattern
 *
 * This typically reduces 250+ entries to 20-40 unique patterns,
 * cutting token usage by 80-90%.
 *
 * When deduplicate = false, all entries are listed with full URLs (for ablation comparison).
 */
export function createLlmSummary(
  entries: CompactEntry[],
  deduplicate: boolean = true,
): LlmSummaryResult {
  if (!deduplicate) {
    // No deduplication: list every entry with its full URL
    const lines = entries.map(
      (e) =>
        `[${e.index}] ${e.method} ${e.url} → ${e.status} (${e.responseType}, ${formatBytes(e.responseSize)})`,
    );
    return {
      summary: lines.join('\n'),
      uniquePatterns: entries.length,
      originalEntries: entries.length,
    };
  }

  // Group entries by their deduplication key
  const groups = new Map<string, CompactEntry[]>();
  for (const entry of entries) {
    const key = getDeduplicationKey(entry);
    const group = groups.get(key) || [];
    group.push(entry);
    groups.set(key, group);
  }

  const lines: string[] = [];
  for (const [, group] of groups) {
    const rep = group[0]; // Representative entry (first occurrence)
    const { base, paramNames } = normalizeUrl(rep.url);

    // Build compact URL: base + param names only (no values)
    let compactUrl = base;
    if (paramNames.length > 0) {
      compactUrl += `?${paramNames.map((n) => `${n}=...`).join('&')}`;
    }

    const countSuffix = group.length > 1 ? ` [x${group.length}]` : '';

    lines.push(
      `[${rep.index}] ${rep.method} ${compactUrl} → ${rep.status} (${rep.responseType}, ${formatBytes(rep.responseSize)})${countSuffix}`,
    );
  }

  return {
    summary: lines.join('\n'),
    uniquePatterns: groups.size,
    originalEntries: entries.length,
  };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
