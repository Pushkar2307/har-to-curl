import { IsNotEmpty, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';

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
}

export class AnalyzeHarDto {
  @IsUUID()
  @IsNotEmpty()
  harId: string;

  @IsString()
  @IsNotEmpty()
  description: string;
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
