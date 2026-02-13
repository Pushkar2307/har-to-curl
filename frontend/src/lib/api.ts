import {
  UploadResponse,
  AnalyzeResponse,
  ExecuteRequest,
  ExecuteResponse,
} from '@/types/har';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

/**
 * Upload a HAR file to the backend for parsing.
 */
export async function uploadHarFile(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE}/har/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Upload failed' }));
    throw new Error(error.message || `Upload failed with status ${response.status}`);
  }

  return response.json();
}

/**
 * Analyze a HAR file to find the best-matching API request.
 */
export async function analyzeHar(
  harId: string,
  description: string,
): Promise<AnalyzeResponse> {
  const response = await fetch(`${API_BASE}/har/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ harId, description }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Analysis failed' }));
    throw new Error(error.message || `Analysis failed with status ${response.status}`);
  }

  return response.json();
}

/**
 * Execute an API request through the backend proxy.
 */
export async function executeRequest(
  request: ExecuteRequest,
): Promise<ExecuteResponse> {
  const response = await fetch(`${API_BASE}/har/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Execution failed' }));
    throw new Error(error.message || `Execution failed with status ${response.status}`);
  }

  return response.json();
}
