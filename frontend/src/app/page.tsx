'use client';

import { useState } from 'react';
import { toast, Toaster } from 'sonner';
import { FileUpload } from '@/components/FileUpload';
import { RequestInspector } from '@/components/RequestInspector';
import { CurlDisplay } from '@/components/CurlDisplay';
import { ResponseViewer } from '@/components/ResponseViewer';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { uploadHarFile, analyzeHar, executeRequest } from '@/lib/api';
import {
  CompactEntry,
  AnalyzeResponse,
  ExecuteResponse,
} from '@/types/har';

export default function Home() {
  // File upload state
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [harId, setHarId] = useState<string | null>(null);
  const [entries, setEntries] = useState<CompactEntry[]>([]);
  const [allEntries, setAllEntries] = useState<CompactEntry[]>([]);
  const [stats, setStats] = useState<{
    total: number;
    removed: number;
    kept: number;
  } | null>(null);

  // Analysis state
  const [description, setDescription] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalyzeResponse | null>(
    null,
  );

  // Execution state
  const [isExecuting, setIsExecuting] = useState(false);
  const [executeResponse, setExecuteResponse] =
    useState<ExecuteResponse | null>(null);

  /**
   * Handle file selection — upload to backend immediately.
   */
  const handleFileSelected = async (file: File) => {
    setCurrentFile(file);
    setIsUploading(true);
    setAnalysisResult(null);
    setExecuteResponse(null);

    try {
      const result = await uploadHarFile(file);
      setHarId(result.id);
      setEntries(result.entries);
      setAllEntries(result.allEntries);
      setStats(result.stats);
      toast.success(
        `Parsed ${result.stats.total} requests, kept ${result.stats.kept} potential API calls`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to upload file',
      );
      setCurrentFile(null);
    } finally {
      setIsUploading(false);
    }
  };

  /**
   * Handle analysis — send description to LLM.
   */
  const handleAnalyze = async () => {
    if (!harId || !description.trim()) return;

    setIsAnalyzing(true);
    setAnalysisResult(null);
    setExecuteResponse(null);

    try {
      const result = await analyzeHar(harId, description, { reasoning: false });
      setAnalysisResult(result);
      toast.success('Found matching API request');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Analysis failed',
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  /**
   * Handle curl execution through backend proxy.
   */
  const handleExecute = async () => {
    if (!analysisResult) return;

    setIsExecuting(true);

    try {
      const details = analysisResult.requestDetails;
      const result = await executeRequest({
        url: details.url,
        method: details.method,
        headers: details.headers,
        body: details.body,
      });
      setExecuteResponse(result);
      toast.success(`Response received: ${result.status} ${result.statusText}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Execution failed',
      );
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Toaster richColors position="top-right" />

      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <svg
              className="h-8 w-8 text-primary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5"
              />
            </svg>
            <div>
              <h1 className="text-xl font-semibold">HAR Reverse Engineer</h1>
              <p className="text-sm text-muted-foreground">
                Upload a .har file and describe the API you want to find
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 space-y-6 max-w-5xl">
        {/* Step 1: Upload */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-medium">
              1
            </span>
            <h2 className="text-sm font-medium">Upload HAR File</h2>
          </div>
          <FileUpload
            onFileSelected={handleFileSelected}
            isLoading={isUploading}
            currentFile={currentFile}
          />
        </section>

        {/* Step 2: Inspect Requests */}
        {entries.length > 0 && (
          <>
            <Separator />
            <section>
              <div className="flex items-center gap-2 mb-3">
                <span className="flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-medium">
                  2
                </span>
                <h2 className="text-sm font-medium">Inspect Requests</h2>
              </div>
              <RequestInspector
                entries={entries}
                allEntries={allEntries}
                stats={stats}
                highlightedIndex={analysisResult?.matchedEntry.index ?? null}
              />
            </section>

            {/* Step 3: Describe the API */}
            <Separator />
            <section>
              <div className="flex items-center gap-2 mb-3">
                <span className="flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-medium">
                  3
                </span>
                <h2 className="text-sm font-medium">
                  Describe the API You Want
                </h2>
              </div>
              <Card>
                <CardContent className="pt-6">
                  <div className="space-y-3">
                    <Textarea
                      placeholder='e.g., "Return the API that fetches the weather of San Francisco" or "Find the endpoint that returns recipe data"'
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                      className="resize-none"
                    />
                    <div className="flex justify-end">
                      <Button
                        onClick={handleAnalyze}
                        disabled={
                          isAnalyzing || !description.trim() || !harId
                        }
                      >
                        {isAnalyzing ? (
                          <span className="flex items-center gap-2">
                            <svg
                              className="h-4 w-4 animate-spin"
                              viewBox="0 0 24 24"
                              fill="none"
                            >
                              <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                              />
                              <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                              />
                            </svg>
                            Analyzing with AI...
                          </span>
                        ) : (
                          'Find API Request'
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>
          </>
        )}

        {/* Step 4: Results */}
        {analysisResult && (
          <>
            <Separator />
            <section>
              <div className="flex items-center gap-2 mb-3">
                <span className="flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-medium">
                  4
                </span>
                <h2 className="text-sm font-medium">Result</h2>
              </div>
              <CurlDisplay
                curl={analysisResult.curl}
                explanation={analysisResult.explanation}
                reasoning={analysisResult.reasoning}
                candidates={analysisResult.candidates}
                matchedIndex={analysisResult.matchedEntry.index}
                onExecute={handleExecute}
                isExecuting={isExecuting}
                tokenUsage={analysisResult.tokenUsage}
                model={analysisResult.model}
                entriesAnalyzed={analysisResult.entriesAnalyzed}
                totalEntries={analysisResult.totalEntries}
                llmLatency={analysisResult.llmLatency}
              />
            </section>
          </>
        )}

        {/* Step 5: Response */}
        {executeResponse && (
          <>
            <Separator />
            <section className="pb-8">
              <div className="flex items-center gap-2 mb-3">
                <span className="flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-medium">
                  5
                </span>
                <h2 className="text-sm font-medium">API Response</h2>
              </div>
              <ResponseViewer response={executeResponse} />
            </section>
          </>
        )}
      </main>
    </div>
  );
}
