'use client';

/**
 * CurlDisplay — Shows the generated curl command with AI analysis details.
 *
 * Sections (top to bottom):
 * 1. Dedup info banner — shown when entries were condensed before LLM analysis
 * 2. AI Analysis panel — collapsible; shows reasoning text and candidate list
 *    with confidence bars (sorted by confidence, best match highlighted)
 * 3. Curl command — copyable code block with Copy and Execute buttons
 * 4. Token usage stats — model, prompt/completion/total tokens, latency
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface CurlDisplayProps {
  curl: string;
  explanation: string;
  reasoning?: string;
  candidates?: Array<{ index: number; url: string; reason: string; confidence: number }>;
  matchedIndex?: number;
  onExecute: () => void;
  isExecuting: boolean;
  tokenUsage?: { prompt: number; completion: number; total: number };
  model?: string;
  entriesAnalyzed?: number;
  totalEntries?: number;
  llmLatency?: number;
}

export function CurlDisplay({
  curl,
  explanation,
  reasoning,
  candidates,
  matchedIndex,
  onExecute,
  isExecuting,
  tokenUsage,
  model,
  entriesAnalyzed,
  totalEntries,
  llmLatency,
}: CurlDisplayProps) {
  const [copied, setCopied] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  /** Copy the curl command to clipboard with a 2-second "Copied" feedback. */
  const handleCopy = async () => {
    await navigator.clipboard.writeText(curl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Deduplication info banner */}
      {totalEntries !== undefined && entriesAnalyzed !== undefined && totalEntries !== entriesAnalyzed && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30 px-4 py-3">
          <div className="flex items-start gap-2">
            <svg className="h-4 w-4 mt-0.5 text-blue-600 dark:text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-sm">
              <span className="font-medium text-blue-800 dark:text-blue-300">Smart deduplication: </span>
              <span className="text-blue-700 dark:text-blue-400">
                {totalEntries} API requests were condensed into{' '}
                <span className="font-semibold">{entriesAnalyzed} unique patterns</span>{' '}
                before sending to the LLM. Duplicate endpoints with different parameter values are grouped together.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* AI Reasoning panel */}
      {(reasoning || (candidates && candidates.length > 0)) && (
        <Card className="border-dashed">
          <CardHeader className="pb-2 pt-4 px-4">
            <button
              className="flex items-center gap-2 text-left w-full"
              onClick={() => setShowDetails(!showDetails)}
            >
              <svg
                className={`h-4 w-4 text-muted-foreground transition-transform ${showDetails ? 'rotate-90' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              <span className="text-sm font-medium">AI Analysis</span>
              <Badge variant="secondary" className="text-xs ml-auto">
                {candidates?.length || 0} candidates considered
              </Badge>
            </button>
          </CardHeader>
          {showDetails && (
            <CardContent className="pt-0 px-4 pb-4 space-y-3">
              {/* Reasoning */}
              {reasoning && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Reasoning</p>
                  <p className="text-sm text-foreground/80 leading-relaxed">{reasoning}</p>
                </div>
              )}

              {/* Candidates */}
              {candidates && candidates.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Candidates Evaluated</p>
                  <div className="space-y-2">
                    {/* Sort candidates by confidence (highest first); highlight the LLM's chosen match */}
                    {candidates
                      .slice()
                      .sort((a, b) => b.confidence - a.confidence)
                      .map((candidate, i) => {
                      const isBestMatch = candidate.index === matchedIndex;
                      const confidence = candidate.confidence ?? 0;
                      // Color and label tiers: >=90 High, >=70 Likely, >=50 Possible, <50 Unlikely
                      const confidenceColor =
                        confidence >= 90
                          ? 'bg-green-500'
                          : confidence >= 70
                            ? 'bg-yellow-500'
                            : confidence >= 50
                              ? 'bg-orange-500'
                              : 'bg-red-500';
                      const confidenceLabel =
                        confidence >= 90
                          ? 'High'
                          : confidence >= 70
                            ? 'Likely'
                            : confidence >= 50
                              ? 'Possible'
                              : 'Unlikely';
                      return (
                      <div
                        key={i}
                        className={`rounded-md border px-3 py-2 text-xs ${
                          isBestMatch
                            ? 'border-primary/30 bg-primary/5'
                            : 'border-border bg-muted/30'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          {isBestMatch && (
                            <Badge variant="default" className="text-[10px] px-1.5 py-0">
                              Best match
                            </Badge>
                          )}
                          <span className="font-mono text-muted-foreground">
                            [{candidate.index}]
                          </span>
                          <span className="font-mono truncate flex-1">{candidate.url}</span>
                          <span className="text-muted-foreground font-medium whitespace-nowrap ml-auto">
                            {confidence}% {confidenceLabel}
                          </span>
                        </div>
                        {/* Confidence bar */}
                        <div className="w-full h-1.5 bg-muted rounded-full mb-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${confidenceColor}`}
                            style={{ width: `${confidence}%` }}
                          />
                        </div>
                        <p className="text-muted-foreground">{candidate.reason}</p>
                      </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          )}
        </Card>
      )}

      {/* Main curl display */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Generated curl Command</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleCopy}>
                {copied ? (
                  <span className="flex items-center gap-1">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Copied
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copy
                  </span>
                )}
              </Button>
              <Button size="sm" onClick={onExecute} disabled={isExecuting}>
                {isExecuting ? (
                  <span className="flex items-center gap-1">
                    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Executing...
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Execute
                  </span>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{explanation}</p>

          {/* Token usage stats */}
          {tokenUsage && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg bg-muted/50 border px-4 py-2.5 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Model:</span>
                <span className="font-medium font-mono">{model}</span>
              </div>
              <div className="h-4 w-px bg-border" />
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Prompt:</span>
                <span className="font-medium font-mono">{tokenUsage.prompt.toLocaleString()}</span>
              </div>
              <div className="h-4 w-px bg-border" />
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Completion:</span>
                <span className="font-medium font-mono">{tokenUsage.completion.toLocaleString()}</span>
              </div>
              <div className="h-4 w-px bg-border" />
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Total:</span>
                <span className="font-semibold font-mono">{tokenUsage.total.toLocaleString()}</span>
              </div>
              {entriesAnalyzed !== undefined && (
                <>
                  <div className="h-4 w-px bg-border" />
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">Unique patterns:</span>
                    <span className="font-medium font-mono">{entriesAnalyzed}</span>
                  </div>
                </>
              )}
              {llmLatency !== undefined && (
                <>
                  <div className="h-4 w-px bg-border" />
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">LLM latency:</span>
                    <span className="font-medium font-mono">
                      {llmLatency >= 1000
                        ? `${(llmLatency / 1000).toFixed(2)}s`
                        : `${llmLatency}ms`}
                    </span>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="relative">
            <pre className="bg-muted rounded-lg p-4 overflow-x-auto text-sm font-mono leading-relaxed">
              <code>{curl}</code>
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
