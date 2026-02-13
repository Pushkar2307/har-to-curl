import {
  parseHarFile,
  filterEntries,
  stripBodies,
  toCompactEntries,
  createLlmSummary,
  HarEntry,
} from './har-parser';

/** Helper: create a minimal HarEntry for testing. */
function makeEntry(overrides: {
  method?: string;
  url?: string;
  status?: number;
  mimeType?: string;
  size?: number;
  postData?: { mimeType: string; text: string };
}): HarEntry {
  return {
    startedDateTime: '2024-01-01T00:00:00.000Z',
    time: 100,
    request: {
      method: overrides.method || 'GET',
      url: overrides.url || 'https://api.example.com/data',
      httpVersion: 'HTTP/2',
      headers: [],
      queryString: [],
      postData: overrides.postData,
      headersSize: 0,
      bodySize: 0,
    },
    response: {
      status: overrides.status ?? 200,
      statusText: 'OK',
      httpVersion: 'HTTP/2',
      headers: [],
      content: {
        size: overrides.size ?? 1024,
        mimeType: overrides.mimeType || 'application/json',
        text: '{"data": "test"}',
      },
      redirectURL: '',
      headersSize: 0,
      bodySize: 0,
    },
    cache: {},
    timings: { send: 0, wait: 50, receive: 50 },
  };
}

// ---------------------------------------------------------------------------
// parseHarFile
// ---------------------------------------------------------------------------
describe('parseHarFile', () => {
  it('should parse valid HAR JSON', () => {
    const har = {
      log: {
        version: '1.2',
        creator: { name: 'test', version: '1.0' },
        entries: [makeEntry({})],
      },
    };
    const result = parseHarFile(JSON.stringify(har));
    expect(result.log.entries).toHaveLength(1);
  });

  it('should throw on invalid JSON', () => {
    expect(() => parseHarFile('not json')).toThrow('not valid JSON');
  });

  it('should throw on missing log.entries', () => {
    expect(() => parseHarFile('{"log": {}}')).toThrow('missing log.entries');
  });
});

// ---------------------------------------------------------------------------
// filterEntries
// ---------------------------------------------------------------------------
describe('filterEntries', () => {
  it('should keep JSON API responses', () => {
    const entries = [makeEntry({ mimeType: 'application/json' })];
    const { filtered, stats } = filterEntries(entries);
    expect(filtered).toHaveLength(1);
    expect(stats.kept).toBe(1);
    expect(stats.removed).toBe(0);
  });

  it('should filter out HTML responses', () => {
    const entries = [makeEntry({ mimeType: 'text/html' })];
    const { filtered, breakdown } = filterEntries(entries);
    expect(filtered).toHaveLength(0);
    expect(breakdown.html).toBe(1);
  });

  it('should filter out static assets by MIME type', () => {
    const entries = [
      makeEntry({ mimeType: 'image/png' }),
      makeEntry({ mimeType: 'text/css' }),
      makeEntry({ mimeType: 'application/javascript' }),
    ];
    const { filtered, breakdown } = filterEntries(entries);
    expect(filtered).toHaveLength(0);
    expect(breakdown.staticAssetMime).toBe(3);
  });

  it('should filter out static assets by URL extension', () => {
    const entries = [
      makeEntry({ url: 'https://cdn.example.com/app.js', mimeType: 'application/json' }),
      makeEntry({ url: 'https://cdn.example.com/style.css', mimeType: 'application/json' }),
    ];
    const { filtered, breakdown } = filterEntries(entries);
    expect(filtered).toHaveLength(0);
    expect(breakdown.staticAssetUrl).toBe(2);
  });

  it('should filter out tracking domains', () => {
    const entries = [
      makeEntry({ url: 'https://google-analytics.com/collect', mimeType: 'application/json' }),
    ];
    const { filtered, breakdown } = filterEntries(entries);
    expect(filtered).toHaveLength(0);
    expect(breakdown.tracking).toBe(1);
  });

  it('should filter out data: and blob: URLs', () => {
    const entries = [
      makeEntry({ url: 'data:text/plain;base64,abc', mimeType: 'application/json' }),
      makeEntry({ url: 'blob:https://example.com/uuid', mimeType: 'application/json' }),
    ];
    const { filtered, breakdown } = filterEntries(entries);
    expect(filtered).toHaveLength(0);
    expect(breakdown.dataBlob).toBe(2);
  });

  it('should filter out redirects (3xx)', () => {
    const entries = [makeEntry({ status: 302 })];
    const { filtered, breakdown } = filterEntries(entries);
    expect(filtered).toHaveLength(0);
    expect(breakdown.redirects).toBe(1);
  });

  it('should filter out OPTIONS preflight requests', () => {
    const entries = [makeEntry({ method: 'OPTIONS' })];
    const { filtered, breakdown } = filterEntries(entries);
    expect(filtered).toHaveLength(0);
    expect(breakdown.options).toBe(1);
  });

  it('should return correct aggregate stats', () => {
    const entries = [
      makeEntry({ mimeType: 'application/json' }),       // kept
      makeEntry({ mimeType: 'text/html' }),               // removed (HTML)
      makeEntry({ mimeType: 'image/png' }),               // removed (static)
      makeEntry({ method: 'OPTIONS' }),                   // removed (preflight)
    ];
    const { stats } = filterEntries(entries);
    expect(stats.total).toBe(4);
    expect(stats.kept).toBe(1);
    expect(stats.removed).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// toCompactEntries
// ---------------------------------------------------------------------------
describe('toCompactEntries', () => {
  it('should map entries to compact format with correct indices', () => {
    const entries = [
      makeEntry({ method: 'GET', url: 'https://api.com/a', status: 200, mimeType: 'application/json', size: 512 }),
      makeEntry({ method: 'POST', url: 'https://api.com/b', status: 201, mimeType: 'text/plain', size: 2048 }),
    ];
    const compact = toCompactEntries(entries);
    expect(compact).toHaveLength(2);
    expect(compact[0]).toEqual({
      index: 0,
      method: 'GET',
      url: 'https://api.com/a',
      status: 200,
      responseType: 'application/json',
      responseSize: 512,
    });
    expect(compact[1].index).toBe(1);
    expect(compact[1].method).toBe('POST');
  });
});

// ---------------------------------------------------------------------------
// stripBodies
// ---------------------------------------------------------------------------
describe('stripBodies', () => {
  it('should remove response body text', () => {
    const entries = [makeEntry({})];
    const stripped = stripBodies(entries);
    expect(stripped[0].response.content.text).toBeUndefined();
  });

  it('should keep request postData but truncate to 10KB', () => {
    const longBody = 'x'.repeat(20000);
    const entries = [
      makeEntry({ postData: { mimeType: 'application/json', text: longBody } }),
    ];
    const stripped = stripBodies(entries);
    expect(stripped[0].request.postData).toBeDefined();
    expect(stripped[0].request.postData!.text.length).toBe(10000);
  });

  it('should set postData to undefined when entry has no postData', () => {
    const entries = [makeEntry({})];
    const stripped = stripBodies(entries);
    expect(stripped[0].request.postData).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// createLlmSummary
// ---------------------------------------------------------------------------
describe('createLlmSummary', () => {
  const compactEntries = [
    { index: 0, method: 'GET', url: 'https://api.com/users?page=1&limit=10', status: 200, responseType: 'application/json', responseSize: 1024 },
    { index: 1, method: 'GET', url: 'https://api.com/users?page=2&limit=10', status: 200, responseType: 'application/json', responseSize: 1024 },
    { index: 2, method: 'POST', url: 'https://api.com/login', status: 200, responseType: 'application/json', responseSize: 512 },
  ];

  describe('with deduplication (default)', () => {
    it('should group duplicate endpoints and report unique patterns', () => {
      const result = createLlmSummary(compactEntries, true);
      // Two /users entries share the same method + path + param names → grouped
      expect(result.uniquePatterns).toBe(2);
      expect(result.originalEntries).toBe(3);
    });

    it('should include [xN] count suffix for grouped entries', () => {
      const result = createLlmSummary(compactEntries, true);
      expect(result.summary).toContain('[x2]');
    });

    it('should compact URLs by replacing query values with "..."', () => {
      const result = createLlmSummary(compactEntries, true);
      expect(result.summary).toContain('limit=...');
      expect(result.summary).toContain('page=...');
      // Original values should not appear
      expect(result.summary).not.toContain('page=1');
    });

    it('should use the first occurrence index as the representative', () => {
      const result = createLlmSummary(compactEntries, true);
      // First line should reference index 0 (first /users entry)
      expect(result.summary).toMatch(/^\[0\]/);
    });
  });

  describe('without deduplication', () => {
    it('should list every entry with full URLs', () => {
      const result = createLlmSummary(compactEntries, false);
      expect(result.uniquePatterns).toBe(3);
      expect(result.originalEntries).toBe(3);
    });

    it('should include full query parameter values', () => {
      const result = createLlmSummary(compactEntries, false);
      expect(result.summary).toContain('page=1');
      expect(result.summary).toContain('page=2');
    });

    it('should not include [xN] count suffix', () => {
      const result = createLlmSummary(compactEntries, false);
      expect(result.summary).not.toContain('[x');
    });
  });
});
