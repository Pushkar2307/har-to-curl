import { generateCurl } from './curl-generator';
import { HarEntry } from './har-parser';

/** Helper: create a minimal HarEntry for curl generation tests. */
function makeEntry(overrides: {
  method?: string;
  url?: string;
  headers?: Array<{ name: string; value: string }>;
  postData?: { mimeType: string; text: string; params?: Array<{ name: string; value: string }> };
}): HarEntry {
  return {
    startedDateTime: '2024-01-01T00:00:00.000Z',
    time: 100,
    request: {
      method: overrides.method || 'GET',
      url: overrides.url || 'https://api.example.com/data',
      httpVersion: 'HTTP/2',
      headers: overrides.headers || [],
      queryString: [],
      postData: overrides.postData,
      headersSize: 0,
      bodySize: 0,
    },
    response: {
      status: 200,
      statusText: 'OK',
      httpVersion: 'HTTP/2',
      headers: [],
      content: { size: 0, mimeType: 'application/json' },
      redirectURL: '',
      headersSize: 0,
      bodySize: 0,
    },
    cache: {},
    timings: { send: 0, wait: 50, receive: 50 },
  };
}

describe('generateCurl', () => {
  it('should produce a basic GET curl command', () => {
    const curl = generateCurl(makeEntry({ url: 'https://api.example.com/users' }));
    expect(curl).toContain('curl');
    expect(curl).toContain('https://api.example.com/users');
    // GET is the default, so -X GET should not appear
    expect(curl).not.toContain('-X GET');
  });

  it('should omit -X POST when body is present (matches Chrome behavior)', () => {
    const curl = generateCurl(
      makeEntry({
        method: 'POST',
        postData: { mimeType: 'application/json', text: '{"key":"value"}' },
      }),
    );
    // --data-raw implies POST, so -X POST should be omitted
    expect(curl).not.toContain('-X POST');
    expect(curl).toContain('--data-raw');
    expect(curl).toContain('{"key":"value"}');
  });

  it('should include -X for PUT, DELETE, PATCH', () => {
    for (const method of ['PUT', 'DELETE', 'PATCH']) {
      const curl = generateCurl(makeEntry({ method }));
      expect(curl).toContain(`-X ${method}`);
    }
  });

  it('should include request headers with -H flags', () => {
    const curl = generateCurl(
      makeEntry({
        headers: [
          { name: 'Accept', value: 'application/json' },
          { name: 'Authorization', value: 'Bearer token123' },
        ],
      }),
    );
    expect(curl).toContain("-H 'Accept: application/json'");
    expect(curl).toContain("-H 'Authorization: Bearer token123'");
  });

  it('should skip HTTP/2 pseudo-headers (:authority, :scheme, :path, :method)', () => {
    const curl = generateCurl(
      makeEntry({
        headers: [
          { name: ':authority', value: 'api.example.com' },
          { name: ':scheme', value: 'https' },
          { name: ':path', value: '/data' },
          { name: ':method', value: 'GET' },
          { name: 'Accept', value: 'application/json' },
        ],
      }),
    );
    expect(curl).not.toContain(':authority');
    expect(curl).not.toContain(':scheme');
    expect(curl).not.toContain(':path');
    expect(curl).not.toContain(':method');
    expect(curl).toContain('Accept');
  });

  it('should skip auto-set headers (host, connection, content-length, accept-encoding)', () => {
    const curl = generateCurl(
      makeEntry({
        headers: [
          { name: 'host', value: 'api.example.com' },
          { name: 'connection', value: 'keep-alive' },
          { name: 'content-length', value: '42' },
          { name: 'accept-encoding', value: 'gzip' },
          { name: 'X-Custom', value: 'keep-me' },
        ],
      }),
    );
    expect(curl).not.toContain("'host:");
    expect(curl).not.toContain("'connection:");
    expect(curl).not.toContain("'content-length:");
    expect(curl).not.toContain("'accept-encoding:");
    expect(curl).toContain('X-Custom');
  });

  it('should escape single quotes in header values', () => {
    const curl = generateCurl(
      makeEntry({
        headers: [{ name: 'Cookie', value: "name=it's" }],
      }),
    );
    // Single quotes should be escaped for shell safety
    expect(curl).toContain("it'\\''s");
  });

  it('should handle form-encoded params with --data-urlencode', () => {
    const curl = generateCurl(
      makeEntry({
        method: 'POST',
        postData: {
          mimeType: 'application/x-www-form-urlencoded',
          text: '',
          params: [
            { name: 'username', value: 'admin' },
            { name: 'password', value: 'secret' },
          ],
        },
      }),
    );
    expect(curl).toContain("--data-urlencode 'username=admin'");
    expect(curl).toContain("--data-urlencode 'password=secret'");
  });

  it('should join parts with backslash-newline for readability', () => {
    const curl = generateCurl(
      makeEntry({
        headers: [{ name: 'Accept', value: 'application/json' }],
      }),
    );
    expect(curl).toContain(' \\\n  ');
  });
});
