/** Compact representation of a HAR entry (from the backend) */
export interface CompactEntry {
  index: number;
  method: string;
  url: string;
  status: number;
  responseType: string;
  responseSize: number;
}

/** Response from POST /api/har/upload */
export interface UploadResponse {
  id: string;
  entries: CompactEntry[];
  allEntries: CompactEntry[];
  stats: {
    total: number;
    removed: number;
    kept: number;
  };
}

/** Response from POST /api/har/analyze */
export interface AnalyzeResponse {
  curl: string;
  requestDetails: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  };
  matchedEntry: CompactEntry;
  explanation: string;
  reasoning: string;
  candidates: Array<{ index: number; url: string; reason: string; confidence: number }>;
  tokenUsage: {
    prompt: number;
    completion: number;
    total: number;
  };
  model: string;
  entriesAnalyzed: number;
  totalEntries: number;
  llmLatency: number;
}

/** Request body for POST /api/har/execute */
export interface ExecuteRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

/** Response from POST /api/har/execute */
export interface ExecuteResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  duration: number;
}
