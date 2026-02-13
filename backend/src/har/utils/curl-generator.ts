/**
 * Curl Command Generator
 *
 * Converts a HAR entry into an executable curl command.
 */

import { HarEntry } from './har-parser';

/** Headers that are typically set automatically by curl and should be skipped */
const SKIP_HEADERS = new Set([
  'host',
  'connection',
  'content-length',
  'accept-encoding',
  ':method',
  ':path',
  ':scheme',
  ':authority',
]);

/** Headers whose values are redacted in generated curl (display/copy only; Execute still sends real values) */
const SENSITIVE_HEADERS = new Set([
  'authorization',
  'cookie',
  'x-api-key',
  'x-auth-token',
  'proxy-authorization',
]);

/**
 * Generate a curl command from a HAR entry.
 */
export function generateCurl(entry: HarEntry): string {
  const { request } = entry;
  const method = request.method.toUpperCase();
  const parts: string[] = ['curl'];

  const hasBody =
    !!request.postData?.text ||
    (request.postData?.params && request.postData.params.length > 0);

  // Method flag: skip for GET (default) and POST when body is present
  // (--data-raw / --data-urlencode already imply POST).
  // Using explicit -X POST with --data-raw can cause issues with HTTP/2
  // negotiation on some servers — matching Chrome's "Copy as cURL" behavior.
  if (method !== 'GET' && !(method === 'POST' && hasBody)) {
    parts.push(`-X ${method}`);
  }

  // URL (with query string already embedded)
  parts.push(`'${escapeShell(request.url)}'`);

  // Headers
  const headers = request.headers.filter(
    (h) => !SKIP_HEADERS.has(h.name.toLowerCase()),
  );

  for (const header of headers) {
    const value = SENSITIVE_HEADERS.has(header.name.toLowerCase())
      ? '[REDACTED]'
      : header.value;
    parts.push(`-H '${escapeShell(`${header.name}: ${value}`)}'`);
  }

  // Request body
  if (request.postData?.text) {
    const body = request.postData.text;
    // Use --data-raw to avoid interpretation of @ and other special chars
    parts.push(`--data-raw '${escapeShell(body)}'`);
  } else if (request.postData?.params && request.postData.params.length > 0) {
    // Form data
    for (const param of request.postData.params) {
      parts.push(
        `--data-urlencode '${escapeShell(`${param.name}=${param.value}`)}'`,
      );
    }
  }

  return parts.join(' \\\n  ');
}

/**
 * Escape single quotes for shell safety.
 */
function escapeShell(str: string): string {
  return str.replace(/'/g, "'\\''");
}
