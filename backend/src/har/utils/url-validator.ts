/**
 * URL Validator — SSRF Protection
 *
 * Prevents Server-Side Request Forgery by blocking requests to:
 * - Private/internal IP ranges (127.x, 10.x, 192.168.x, 172.16-31.x)
 * - Cloud metadata endpoints (169.254.169.254)
 * - Non-HTTP protocols (file://, ftp://, etc.)
 * - Localhost and loopback addresses
 */

import { BadRequestException } from '@nestjs/common';
import { lookup } from 'dns/promises';

/** Private and reserved IP ranges that should never be accessed via the proxy */
const BLOCKED_IP_PATTERNS = [
  /^127\./, // Loopback
  /^10\./, // Private Class A
  /^172\.(1[6-9]|2[0-9]|3[01])\./, // Private Class B
  /^192\.168\./, // Private Class C
  /^169\.254\./, // Link-local / AWS metadata
  /^0\./, // "This" network
  /^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./, // Carrier-grade NAT
  /^::1$/, // IPv6 loopback
  /^fc00:/, // IPv6 unique local
  /^fe80:/, // IPv6 link-local
];

/** Hostnames that should always be blocked */
const BLOCKED_HOSTNAMES = [
  'localhost',
  'metadata.google.internal', // GCP metadata
  'metadata.internal', // Generic cloud metadata
];

/**
 * Assert that a URL uses http or https only (sync, no DNS).
 * Use when generating curl or before using a URL from HAR; for execute, use validateUrl() for full SSRF checks.
 */
export function assertHttpOrHttpsUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new BadRequestException('Invalid URL format');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new BadRequestException(
      `Protocol "${parsed.protocol}" is not allowed. Only http: and https: are permitted.`,
    );
  }
}

/**
 * Validate a URL is safe to request from the server.
 * Throws BadRequestException if the URL is potentially dangerous.
 */
export async function validateUrl(url: string): Promise<void> {
  let parsed: URL;

  // 1. Parse the URL
  try {
    parsed = new URL(url);
  } catch {
    throw new BadRequestException('Invalid URL format');
  }

  // 2. Only allow HTTP and HTTPS protocols
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new BadRequestException(
      `Protocol "${parsed.protocol}" is not allowed. Only http: and https: are permitted.`,
    );
  }

  // 3. Block known dangerous hostnames
  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.includes(hostname)) {
    throw new BadRequestException(
      `Requests to "${hostname}" are blocked for security reasons.`,
    );
  }

  // 4. Check if the hostname is an IP address and block private ranges
  if (isBlockedIp(hostname)) {
    throw new BadRequestException(
      'Requests to private/internal IP addresses are blocked for security reasons.',
    );
  }

  // 5. Resolve DNS and check the actual IP (prevents DNS rebinding attacks)
  try {
    const { address } = await lookup(hostname);
    if (isBlockedIp(address)) {
      throw new BadRequestException(
        `The domain "${hostname}" resolves to a private IP address (${address}), which is blocked for security reasons.`,
      );
    }
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    // DNS resolution failed — could be a non-existent domain, let fetch handle it
  }
}

/**
 * Check if an IP address belongs to a blocked range.
 */
function isBlockedIp(ip: string): boolean {
  return BLOCKED_IP_PATTERNS.some((pattern) => pattern.test(ip));
}
