import { assertHttpOrHttpsUrl, validateUrl } from './url-validator';

// Mock dns/promises to avoid real DNS lookups in tests
jest.mock('dns/promises', () => ({
  lookup: jest.fn().mockResolvedValue({ address: '93.184.216.34', family: 4 }),
}));

describe('validateUrl', () => {
  // --- Valid URLs ---
  it('should allow a valid HTTPS URL', async () => {
    await expect(validateUrl('https://api.example.com/data')).resolves.toBeUndefined();
  });

  it('should allow a valid HTTP URL', async () => {
    await expect(validateUrl('http://api.example.com/data')).resolves.toBeUndefined();
  });

  // --- Invalid format ---
  it('should reject an invalid URL format', async () => {
    await expect(validateUrl('not-a-url')).rejects.toThrow('Invalid URL format');
  });

  // --- Non-HTTP protocols ---
  it('should reject ftp:// protocol', async () => {
    await expect(validateUrl('ftp://files.example.com/file.txt')).rejects.toThrow('not allowed');
  });

  it('should reject file:// protocol', async () => {
    await expect(validateUrl('file:///etc/passwd')).rejects.toThrow('not allowed');
  });

  // --- Blocked hostnames ---
  it('should reject localhost', async () => {
    await expect(validateUrl('http://localhost:3000/api')).rejects.toThrow('blocked');
  });

  it('should reject metadata.google.internal (GCP metadata)', async () => {
    await expect(validateUrl('http://metadata.google.internal/computeMetadata')).rejects.toThrow('blocked');
  });

  // --- Private IP ranges ---
  it('should reject 127.0.0.1 (loopback)', async () => {
    await expect(validateUrl('http://127.0.0.1/admin')).rejects.toThrow('private');
  });

  it('should reject 10.x.x.x (Class A private)', async () => {
    await expect(validateUrl('http://10.0.0.1/internal')).rejects.toThrow('private');
  });

  it('should reject 192.168.x.x (Class C private)', async () => {
    await expect(validateUrl('http://192.168.1.1/router')).rejects.toThrow('private');
  });

  it('should reject 169.254.169.254 (AWS/cloud metadata)', async () => {
    await expect(validateUrl('http://169.254.169.254/latest/meta-data')).rejects.toThrow('private');
  });

  it('should reject 172.16-31.x.x (Class B private)', async () => {
    await expect(validateUrl('http://172.16.0.1/internal')).rejects.toThrow('private');
  });

  // --- DNS rebinding protection ---
  it('should reject when DNS resolves to a private IP', async () => {
    const { lookup } = require('dns/promises');
    // Simulate DNS rebinding: domain resolves to a private IP
    lookup.mockResolvedValueOnce({ address: '127.0.0.1', family: 4 });

    await expect(validateUrl('https://evil-rebind.example.com/api')).rejects.toThrow(
      'resolves to a private IP',
    );
  });

  it('should allow when DNS resolves to a public IP', async () => {
    const { lookup } = require('dns/promises');
    lookup.mockResolvedValueOnce({ address: '93.184.216.34', family: 4 });

    await expect(validateUrl('https://example.com/api')).resolves.toBeUndefined();
  });
});

describe('assertHttpOrHttpsUrl', () => {
  it('should allow http and https', () => {
    expect(() => assertHttpOrHttpsUrl('http://example.com')).not.toThrow();
    expect(() => assertHttpOrHttpsUrl('https://api.example.com/path')).not.toThrow();
  });

  it('should reject invalid URL format', () => {
    expect(() => assertHttpOrHttpsUrl('not-a-url')).toThrow('Invalid URL format');
  });

  it('should reject non-http(s) protocols', () => {
    expect(() => assertHttpOrHttpsUrl('javascript:alert(1)')).toThrow('not allowed');
    expect(() => assertHttpOrHttpsUrl('file:///etc/passwd')).toThrow('not allowed');
    expect(() => assertHttpOrHttpsUrl('ftp://files.example.com')).toThrow('not allowed');
    expect(() => assertHttpOrHttpsUrl('data:text/html,<script>')).toThrow('not allowed');
  });
});
