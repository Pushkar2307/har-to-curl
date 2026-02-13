#!/usr/bin/env npx tsx
/**
 * Ablation Study Script
 *
 * Runs the same HAR file + query through all feature flag combinations
 * and generates a comparison report showing the trade-offs between
 * token efficiency (deduplication) and explainability (reasoning).
 *
 * Usage:
 *   npx tsx scripts/ablation.ts [--har <path>] [--query <description>]
 *
 * Defaults:
 *   --har   examples/jokes/jokes.har
 *   --query "Find the API that fetches jokes"
 *
 * Prerequisites:
 *   Backend must be running on http://localhost:3001
 */

import * as fs from 'fs';
import * as path from 'path';

const API_BASE = process.env.API_BASE || 'http://localhost:3001/api';

// --- Parse CLI args ---
function parseArgs(): { harPath: string; query: string } {
  const args = process.argv.slice(2);
  let harPath = 'examples/jokes/jokes.har';
  let query = 'Find the API that fetches jokes';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--har' && args[i + 1]) harPath = args[++i];
    if (args[i] === '--query' && args[i + 1]) query = args[++i];
  }

  return { harPath, query };
}

// --- API helpers ---
interface FilterBreakdown {
  html: number;
  staticAssetMime: number;
  staticAssetUrl: number;
  tracking: number;
  dataBlob: number;
  redirects: number;
  options: number;
}

interface UploadResult {
  id: string;
  stats: { total: number; removed: number; kept: number };
  filterBreakdown: FilterBreakdown;
}

async function uploadHar(filePath: string): Promise<UploadResult> {
  const absolutePath = path.resolve(filePath);
  const fileBuffer = fs.readFileSync(absolutePath);
  const blob = new Blob([fileBuffer], { type: 'application/json' });

  const formData = new FormData();
  formData.append('file', blob, path.basename(filePath));

  const res = await fetch(`${API_BASE}/har/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) throw new Error(`Upload failed: ${res.status} ${await res.text()}`);
  return res.json();
}

interface AnalyzeResult {
  curl: string;
  matchedEntry: { index: number; method: string; url: string };
  explanation: string;
  reasoning: string;
  candidates: Array<{ index: number; url: string; confidence: number }>;
  tokenUsage: { prompt: number; completion: number; total: number };
  model: string;
  entriesAnalyzed: number;
  totalEntries: number;
  llmLatency: number;
}

async function analyzeHar(
  harId: string,
  description: string,
  options: { deduplication: boolean; candidates: boolean; reasoning: boolean },
): Promise<AnalyzeResult> {
  const res = await fetch(`${API_BASE}/har/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ harId, description, ...options }),
  });

  if (!res.ok) throw new Error(`Analyze failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// --- Feature flag combinations ---
// Tests each feature independently to measure its isolated token cost
const CONFIGS = [
  { name: 'Baseline (minimal)',              deduplication: false, candidates: false, reasoning: false },
  { name: '+ Deduplication only',            deduplication: true,  candidates: false, reasoning: false },
  { name: '+ Candidates only',              deduplication: false, candidates: true,  reasoning: false },
  { name: '+ Reasoning only',               deduplication: false, candidates: false, reasoning: true },
  { name: '+ Candidates + Reasoning',       deduplication: false, candidates: true,  reasoning: true },
  { name: 'Dedup + Candidates (default)',    deduplication: true,  candidates: true,  reasoning: false },
  { name: 'All features (with reasoning)',   deduplication: true,  candidates: true,  reasoning: true },
];

// --- Main ---
async function main() {
  const { harPath, query } = parseArgs();

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║              HAR-to-Curl Ablation Study                     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log();
  console.log(`HAR file:  ${harPath}`);
  console.log(`Query:     "${query}"`);
  console.log(`API:       ${API_BASE}`);
  console.log();

  // Step 1: Upload HAR file (once — reuse for all configs)
  console.log('Uploading HAR file...');
  const upload = await uploadHar(harPath);
  console.log(`  Uploaded: ${upload.stats.total} total entries, ${upload.stats.kept} after filtering`);
  console.log(`  Filter breakdown:`, upload.filterBreakdown);
  console.log(`  HAR ID: ${upload.id}`);
  console.log();

  // Step 2: Run all configurations
  const results: Array<{
    config: string;
    dedup: boolean;
    withCandidates: boolean;
    reasoning: boolean;
    entriesSent: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    latencyMs: number;
    matchedIndex: number;
    matchedUrl: string;
    explanation: string;
    candidateCount: number;
  }> = [];

  for (const config of CONFIGS) {
    console.log(`Running: ${config.name}...`);

    const result = await analyzeHar(upload.id, query, {
      deduplication: config.deduplication,
      candidates: config.candidates,
      reasoning: config.reasoning,
    });

    const row = {
      config: config.name,
      dedup: config.deduplication,
      withCandidates: config.candidates,
      reasoning: config.reasoning,
      entriesSent: result.entriesAnalyzed,
      promptTokens: result.tokenUsage.prompt,
      completionTokens: result.tokenUsage.completion,
      totalTokens: result.tokenUsage.total,
      latencyMs: result.llmLatency,
      matchedIndex: result.matchedEntry.index,
      matchedUrl: result.matchedEntry.url,
      explanation: result.explanation,
      candidateCount: result.candidates?.length || 0,
    };

    results.push(row);
    console.log(`  ✓ ${result.tokenUsage.total} tokens, ${result.llmLatency}ms, matched [${row.matchedIndex}]`);
  }

  console.log();

  // Step 3: Generate markdown report
  const report = generateReport(harPath, query, upload, results);
  console.log(report);

  // Save report to file
  const reportsDir = path.resolve('reports');
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `ablation-${path.basename(harPath, '.har')}.md`);
  fs.writeFileSync(reportPath, report);
  console.log(`\nReport saved to: ${reportPath}`);
}

function generateReport(
  harPath: string,
  query: string,
  upload: UploadResult,
  results: Array<{
    config: string;
    dedup: boolean;
    withCandidates: boolean;
    reasoning: boolean;
    entriesSent: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    latencyMs: number;
    matchedIndex: number;
    matchedUrl: string;
    explanation: string;
    candidateCount: number;
  }>,
): string {
  const baseline = results[0];
  const allFeatures = results[results.length - 1];

  // Check if all configs matched the same entry
  const allSameMatch = results.every((r) => r.matchedIndex === results[0].matchedIndex);

  // Get dedup count from the config that has dedup on + nothing else
  const dedupConfig = results.find((r) => r.dedup && !r.withCandidates && !r.reasoning);
  const afterDedup = dedupConfig ? dedupConfig.entriesSent : upload.stats.kept;

  let md = `# Ablation Study: Token Efficiency vs Explainability\n\n`;
  md += `**Date:** ${new Date().toISOString().split('T')[0]}\n`;
  md += `**HAR file:** \`${harPath}\` (${upload.stats.total} total entries, ${upload.stats.kept} after filtering)\n`;
  md += `**Query:** "${query}"\n\n`;

  // Processing Pipeline section
  const fb = upload.filterBreakdown;
  md += `## Processing Pipeline\n\n`;
  md += `Shows how each stage reduces the number of entries before the LLM sees them.\n\n`;

  md += `| Stage | Entries | Removed | Cumulative Reduction |\n`;
  md += `|---|---|---|---|\n`;
  md += `| **Raw HAR entries** | ${upload.stats.total} | — | — |\n`;

  // Filter stages — build the waterfall
  let remaining = upload.stats.total;
  const stages: Array<{ name: string; removed: number }> = [];

  if (fb.html > 0) stages.push({ name: 'Remove HTML responses', removed: fb.html });
  if (fb.staticAssetMime > 0) stages.push({ name: 'Remove static assets (MIME type)', removed: fb.staticAssetMime });
  if (fb.staticAssetUrl > 0) stages.push({ name: 'Remove static assets (URL pattern)', removed: fb.staticAssetUrl });
  if (fb.tracking > 0) stages.push({ name: 'Remove tracking/analytics', removed: fb.tracking });
  if (fb.dataBlob > 0) stages.push({ name: 'Remove data:/blob: URLs', removed: fb.dataBlob });
  if (fb.redirects > 0) stages.push({ name: 'Remove redirects (3xx)', removed: fb.redirects });
  if (fb.options > 0) stages.push({ name: 'Remove OPTIONS preflight', removed: fb.options });

  for (const stage of stages) {
    remaining -= stage.removed;
    const pctReduction = ((1 - remaining / upload.stats.total) * 100).toFixed(1);
    md += `| ${stage.name} | ${remaining} | -${stage.removed} | -${pctReduction}% |\n`;
  }

  // Deduplication row
  if (afterDedup !== upload.stats.kept) {
    const dedupRemoved = upload.stats.kept - afterDedup;
    const pctReduction = ((1 - afterDedup / upload.stats.total) * 100).toFixed(1);
    md += `| **Deduplicate** (same endpoint pattern) | **${afterDedup}** | -${dedupRemoved} | -${pctReduction}% |\n`;
  } else {
    md += `| **Deduplicate** (same endpoint pattern) | **${afterDedup}** | 0 | -${((1 - afterDedup / upload.stats.total) * 100).toFixed(1)}% |\n`;
  }

  md += `\n`;
  md += `> **Summary:** ${upload.stats.total} raw entries → ${upload.stats.kept} after filtering (${((1 - upload.stats.kept / upload.stats.total) * 100).toFixed(1)}% removed) → ${afterDedup} unique patterns after dedup (${((1 - afterDedup / upload.stats.total) * 100).toFixed(1)}% total reduction)\n\n`;
  md += `> **Note — Body stripping:** After filtering, response bodies are dropped entirely and request bodies are truncated to 10 KB. This does not reduce entry count but significantly lowers memory usage for large HAR files (e.g. 87 MB → lightweight metadata only). The LLM never sees response bodies — only method, URL, status, MIME type, and size.\n\n`;

  // Main results table
  md += `## LLM Feature Flag Ablation\n\n`;
  md += `*Latency = LLM API call time only (excludes parsing, filtering, dedup)*\n\n`;
  md += `| Configuration | Dedup | Candidates | Reasoning | Entries | Prompt Tok | Compl Tok | Total Tok | % vs Baseline | Latency | Match |\n`;
  md += `|---|---|---|---|---|---|---|---|---|---|---|\n`;

  for (const r of results) {
    const pctChange = ((r.totalTokens - baseline.totalTokens) / baseline.totalTokens * 100).toFixed(1);
    const pctLabel = r === baseline ? '—' : `${Number(pctChange) > 0 ? '+' : ''}${pctChange}%`;
    md += `| ${r.config} | ${r.dedup ? '✓' : '✗'} | ${r.withCandidates ? '✓' : '✗'} | ${r.reasoning ? '✓' : '✗'} | ${r.entriesSent} | ${r.promptTokens.toLocaleString()} | ${r.completionTokens} | ${r.totalTokens.toLocaleString()} | ${pctLabel} | ${r.latencyMs}ms | [${r.matchedIndex}] |\n`;
  }

  md += `\n`;

  // Isolated feature costs
  md += `## Isolated Feature Costs\n\n`;

  const dedupOnly = results.find((r) => r.dedup && !r.withCandidates && !r.reasoning);
  const candidatesOnly = results.find((r) => !r.dedup && r.withCandidates && !r.reasoning);
  const reasoningOnly = results.find((r) => !r.dedup && !r.withCandidates && r.reasoning);
  const candidatesPlusReasoning = results.find((r) => !r.dedup && r.withCandidates && r.reasoning);
  const dedupPlusCandidates = results.find((r) => r.dedup && r.withCandidates && !r.reasoning);

  md += `| Feature | Prompt Δ | Completion Δ | Total Δ | What you get |\n`;
  md += `|---|---|---|---|---|\n`;

  if (dedupOnly) {
    const promptDelta = dedupOnly.promptTokens - baseline.promptTokens;
    const compDelta = dedupOnly.completionTokens - baseline.completionTokens;
    const totalDelta = dedupOnly.totalTokens - baseline.totalTokens;
    md += `| Deduplication | ${promptDelta >= 0 ? '+' : ''}${promptDelta.toLocaleString()} | ${compDelta >= 0 ? '+' : ''}${compDelta} | ${totalDelta >= 0 ? '+' : ''}${totalDelta.toLocaleString()} | URL compaction, fewer entries sent |\n`;
  }
  if (candidatesOnly) {
    const promptDelta = candidatesOnly.promptTokens - baseline.promptTokens;
    const compDelta = candidatesOnly.completionTokens - baseline.completionTokens;
    const totalDelta = candidatesOnly.totalTokens - baseline.totalTokens;
    md += `| Candidates + Confidence | +${promptDelta} | +${compDelta} | +${totalDelta} | Ranked alternatives with confidence bars |\n`;
  }
  if (reasoningOnly) {
    const promptDelta = reasoningOnly.promptTokens - baseline.promptTokens;
    const compDelta = reasoningOnly.completionTokens - baseline.completionTokens;
    const totalDelta = reasoningOnly.totalTokens - baseline.totalTokens;
    md += `| Reasoning text | +${promptDelta} | +${compDelta} | +${totalDelta} | Verbose thought process explanation |\n`;
  }

  md += `\n`;

  // Recommended config
  md += `## Shipping Default vs All Features\n\n`;

  if (dedupPlusCandidates) {
    const savings = ((1 - dedupPlusCandidates.totalTokens / baseline.totalTokens) * 100).toFixed(1);
    md += `**Dedup + Candidates (shipping default):** ${dedupPlusCandidates.totalTokens.toLocaleString()} tokens (${savings}% vs baseline)\n`;
    md += `- Confidence bars + candidate list provide the high-value UX\n`;
    md += `- Reasoning text omitted — adds ~${reasoningOnly ? reasoningOnly.completionTokens - baseline.completionTokens : '?'} completion tokens for limited end-user value\n\n`;
  }

  md += `**All features (with reasoning):** ${allFeatures.totalTokens.toLocaleString()} tokens\n`;
  const allSavings = ((1 - allFeatures.totalTokens / baseline.totalTokens) * 100).toFixed(1);
  md += `- Full transparency including verbose reasoning text (${allSavings}% vs baseline)\n`;
  md += `- Available via \`reasoning: true\` flag for debugging or detailed analysis\n\n`;

  // Correctness
  md += `## Correctness\n\n`;
  md += `${allSameMatch ? '**All configurations returned the same match** ✓ — feature flags do not affect accuracy.' : '⚠️ Configurations returned different matches — see details below.'}\n\n`;

  // Matched entry details
  md += `## Matched Entry Details\n\n`;
  for (const r of results) {
    md += `**${r.config}:** [${r.matchedIndex}] ${r.matchedUrl}\n`;
    md += `> ${r.explanation}\n\n`;
  }

  md += `---\n*Generated by ablation.ts*\n`;

  return md;
}

main().catch((err) => {
  console.error('Ablation study failed:', err.message);
  process.exit(1);
});
