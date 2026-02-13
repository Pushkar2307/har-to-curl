import { IsBoolean, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';

export class UploadHarResponseDto {
  id: string;
  entries: Array<{
    index: number;
    method: string;
    url: string;
    status: number;
    responseType: string;
    responseSize: number;
  }>;
  allEntries: Array<{
    index: number;
    method: string;
    url: string;
    status: number;
    responseType: string;
    responseSize: number;
  }>;
  stats: {
    total: number;
    removed: number;
    kept: number;
  };
  filterBreakdown: {
    html: number;
    staticAssetMime: number;
    staticAssetUrl: number;
    tracking: number;
    dataBlob: number;
    redirects: number;
    options: number;
  };
}

export class AnalyzeHarDto {
  @IsUUID()
  @IsNotEmpty()
  harId: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  /** When true, deduplicates entries and compacts URLs before sending to LLM (reduces prompt tokens). Default: true */
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  deduplication?: boolean = true;

  /** When true, asks LLM for candidate list with confidence scores. Default: true */
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  candidates?: boolean = true;

  /** When true, asks LLM for verbose reasoning text. Default: true */
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  reasoning?: boolean = true;
}

export class AnalyzeHarResponseDto {
  curl: string;
  requestDetails: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  };
  matchedEntry: {
    index: number;
    method: string;
    url: string;
    status: number;
    responseType: string;
    responseSize: number;
  };
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

export class ExecuteRequestDto {
  @IsString()
  @IsNotEmpty()
  url: string;

  @IsString()
  @IsNotEmpty()
  method: string;

  @IsObject()
  @IsOptional()
  headers: Record<string, string>;

  @IsString()
  @IsOptional()
  body?: string;
}

export class ExecuteResponseDto {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  duration: number;
}
