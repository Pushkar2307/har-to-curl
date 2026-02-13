import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { LlmService } from '../llm/llm.service';
import {
  AnalyzeHarResponseDto,
  ExecuteRequestDto,
  ExecuteResponseDto,
  UploadHarResponseDto,
} from './dto/analyze-har.dto';
import { generateCurl } from './utils/curl-generator';
import { validateUrl } from './utils/url-validator';
import {
  CompactEntry,
  filterEntries,
  HarEntry,
  parseHarFile,
  stripBodies,
  toCompactEntries,
  createLlmSummary,
} from './utils/har-parser';

interface StoredHar {
  entries: HarEntry[];
  compactEntries: CompactEntry[];
  createdAt: Date;
}

@Injectable()
export class HarService {
  private readonly logger = new Logger(HarService.name);
  private readonly store = new Map<string, StoredHar>();

  // Auto-cleanup interval: remove HAR data older than 30 minutes
  private readonly TTL_MS = 30 * 60 * 1000;

  constructor(private readonly llmService: LlmService) {
    // Periodically clean up old stored HAR files
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Parse and store an uploaded HAR file.
   */
  async upload(fileContent: string): Promise<UploadHarResponseDto> {
    const harFile = parseHarFile(fileContent);
    const allCompactEntries = toCompactEntries(harFile.log.entries);
    const { filtered, stats } = filterEntries(harFile.log.entries);
    const compactEntries = toCompactEntries(filtered);

    // Strip response bodies to save memory — we only need request details for curl
    const lightweight = stripBodies(filtered);

    const id = randomUUID();
    this.store.set(id, {
      entries: lightweight,
      compactEntries,
      createdAt: new Date(),
    });

    this.logger.log(
      `Stored HAR ${id}: ${stats.total} total → ${stats.kept} kept (${stats.removed} filtered out)`,
    );

    return { id, entries: compactEntries, allEntries: allCompactEntries, stats };
  }

  /**
   * Use the LLM to find the best-matching request and generate a curl command.
   */
  async analyze(
    harId: string,
    description: string,
    options: { deduplication?: boolean; reasoning?: boolean } = {},
  ): Promise<AnalyzeHarResponseDto> {
    const deduplicate = options.deduplication !== false; // default true
    const reasoning = options.reasoning !== false; // default true

    const stored = this.store.get(harId);
    if (!stored) {
      throw new NotFoundException(
        `HAR file not found (id: ${harId}). It may have expired. Please re-upload.`,
      );
    }

    // Create summary for the LLM (deduplicated + compacted when flag is on)
    const { summary, uniquePatterns, originalEntries } =
      createLlmSummary(stored.compactEntries, deduplicate);

    this.logger.log(
      `Analyzing HAR ${harId}: ${originalEntries} entries → ${uniquePatterns} unique patterns for LLM [dedup=${deduplicate}, reasoning=${reasoning}]`,
    );

    // Query the LLM to identify the best match
    const llmStart = Date.now();
    const { index, explanation, reasoning: llmReasoning, candidates, tokenUsage, model } =
      await this.llmService.identifyRequest(summary, description, { reasoning });
    const llmDuration = Date.now() - llmStart;

    // Validate the returned index
    if (index < 0 || index >= stored.entries.length) {
      throw new Error(
        `LLM returned invalid index ${index} (valid range: 0-${stored.entries.length - 1})`,
      );
    }

    // Generate curl command from the matched entry
    const matchedEntry = stored.entries[index];
    const curl = generateCurl(matchedEntry);

    // Extract full request details for the Execute button
    const requestHeaders: Record<string, string> = {};
    for (const h of matchedEntry.request.headers) {
      const name = h.name.toLowerCase();
      // Skip pseudo-headers and auto-set headers
      if (!name.startsWith(':') && name !== 'host' && name !== 'connection' && name !== 'content-length') {
        requestHeaders[h.name] = h.value;
      }
    }

    return {
      curl,
      matchedEntry: stored.compactEntries[index],
      requestDetails: {
        url: matchedEntry.request.url,
        method: matchedEntry.request.method,
        headers: requestHeaders,
        body: matchedEntry.request.postData?.text || undefined,
      },
      explanation,
      reasoning: llmReasoning,
      candidates,
      tokenUsage,
      model,
      entriesAnalyzed: uniquePatterns,
      totalEntries: originalEntries,
      llmLatency: llmDuration,
    };
  }

  /**
   * Execute an HTTP request as a proxy (so the browser doesn't hit CORS issues).
   * Includes a 15-second timeout to avoid hanging on unresponsive servers.
   */
  async execute(dto: ExecuteRequestDto): Promise<ExecuteResponseDto> {
    const startTime = Date.now();
    const TIMEOUT_MS = 30_000;

    // SSRF protection: validate URL before making the request
    await validateUrl(dto.url);

    this.logger.log(`Executing ${dto.method} ${dto.url}`);

    const fetchOptions: RequestInit = {
      method: dto.method,
      headers: dto.headers || {},
      signal: AbortSignal.timeout(TIMEOUT_MS),
    };

    if (dto.body && dto.method !== 'GET' && dto.method !== 'HEAD') {
      fetchOptions.body = dto.body;
    }

    try {
      const response = await fetch(dto.url, fetchOptions);
      const duration = Date.now() - startTime;

      // Read response body as text
      const body = await response.text();

      // Convert headers to a plain object
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      return {
        status: response.status,
        statusText: response.statusText,
        headers,
        body,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        this.logger.warn(
          `Request to ${dto.url} timed out after ${TIMEOUT_MS}ms`,
        );
        return {
          status: 408,
          statusText: 'Request Timeout',
          headers: {},
          body: JSON.stringify({
            error: 'Request timed out',
            message: `The server at ${new URL(dto.url).hostname} did not respond within ${TIMEOUT_MS / 1000} seconds. This often happens when the API requires an active session, valid cookies, or has rate limiting.`,
            suggestion:
              'Try copying the curl command and running it directly in your terminal — it includes all the original headers and cookies from the HAR capture.',
          }),
          duration,
        };
      }

      this.logger.error(`Request to ${dto.url} failed: ${error.message}`);
      return {
        status: 502,
        statusText: 'Bad Gateway',
        headers: {},
        body: JSON.stringify({
          error: 'Request failed',
          message: error.message,
          suggestion:
            'The target server may be unreachable. Try copying the curl command and running it in your terminal.',
        }),
        duration,
      };
    }
  }

  /**
   * Get all entries for a stored HAR file (for the inspector).
   */
  getEntries(harId: string): CompactEntry[] {
    const stored = this.store.get(harId);
    if (!stored) {
      throw new NotFoundException(`HAR file not found (id: ${harId}).`);
    }
    return stored.compactEntries;
  }

  /**
   * Clean up expired HAR data from memory.
   */
  private cleanup(): void {
    const now = Date.now();
    let removed = 0;
    for (const [id, data] of this.store.entries()) {
      if (now - data.createdAt.getTime() > this.TTL_MS) {
        this.store.delete(id);
        removed++;
      }
    }
    if (removed > 0) {
      this.logger.log(`Cleaned up ${removed} expired HAR file(s)`);
    }
  }
}
