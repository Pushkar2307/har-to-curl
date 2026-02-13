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
async function uploadHar(filePath: string): Promise<{ id: string; stats: { total: number; kept: number } }> {
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
  options: { deduplication: boolean; reasoning: boolean },
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
const CONFIGS = [
  { name: 'Baseline (no dedup, no reasoning)', deduplication: false, reasoning: false },
  { name: '+ Deduplication only', deduplication: true, reasoning: false },
  { name: '+ Reasoning only', deduplication: false, reasoning: true },
  { name: 'All features (default)', deduplication: true, reasoning: true },
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
  console.log(`  HAR ID: ${upload.id}`);
  console.log();

  // Step 2: Run all configurations
  const results: Array<{
    config: string;
    dedup: boolean;
    reasoning: boolean;
    entriesSent: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    latencyMs: number;
    matchedIndex: number;
    matchedUrl: string;
    explanation: string;
    candidates: number;
  }> = [];

  for (const config of CONFIGS) {
    console.log(`Running: ${config.name}...`);

    const result = await analyzeHar(upload.id, query, {
      deduplication: config.deduplication,
      reasoning: config.reasoning,
    });

    const row = {
      config: config.name,
      dedup: config.deduplication,
      reasoning: config.reasoning,
      entriesSent: result.entriesAnalyzed,
      promptTokens: result.tokenUsage.prompt,
      completionTokens: result.tokenUsage.completion,
      totalTokens: result.tokenUsage.total,
      latencyMs: result.llmLatency,
      matchedIndex: result.matchedEntry.index,
      matchedUrl: result.matchedEntry.url,
      explanation: result.explanation,
      candidates: result.candidates?.length || 0,
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
  const reportPath = path.join(reportsDir, `ablation-${path.basename(harPath, '.har')}-${Date.now()}.md`);
  fs.writeFileSync(reportPath, report);
  console.log(`\nReport saved to: ${reportPath}`);
}

function generateReport(
  harPath: string,
  query: string,
  upload: { stats: { total: number; kept: number } },
  results: Array<{
    config: string;
    dedup: boolean;
    reasoning: boolean;
    entriesSent: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    latencyMs: number;
    matchedIndex: number;
    matchedUrl: string;
    explanation: string;
    candidates: number;
  }>,
): string {
  const baseline = results[0];
  const allFeatures = results[results.length - 1];

  // Check if all configs matched the same entry
  const allSameMatch = results.every((r) => r.matchedIndex === results[0].matchedIndex);

  let md = `# Ablation Study: Token Efficiency vs Explainability\n\n`;
  md += `**Date:** ${new Date().toISOString().split('T')[0]}\n`;
  md += `**HAR file:** \`${harPath}\` (${upload.stats.total} total entries, ${upload.stats.kept} after filtering)\n`;
  md += `**Query:** "${query}"\n\n`;

  // Main results table
  md += `## Results\n\n`;
  md += `| Configuration | Entries Sent | Prompt Tokens | Completion Tokens | Total Tokens | Latency | Matched Index |\n`;
  md += `|---|---|---|---|---|---|---|\n`;

  for (const r of results) {
    md += `| ${r.config} | ${r.entriesSent} | ${r.promptTokens.toLocaleString()} | ${r.completionTokens} | ${r.totalTokens.toLocaleString()} | ${r.latencyMs}ms | [${r.matchedIndex}] |\n`;
  }

  md += `\n`;

  // Savings analysis
  md += `## Analysis\n\n`;

  const promptSavings = ((1 - allFeatures.promptTokens / baseline.promptTokens) * 100).toFixed(1);
  const completionCost = allFeatures.completionTokens - baseline.completionTokens;
  const totalSavings = ((1 - allFeatures.totalTokens / baseline.totalTokens) * 100).toFixed(1);
  const latencyDiff = allFeatures.latencyMs - baseline.latencyMs;

  md += `### Deduplication Impact (prompt tokens)\n`;
  md += `- Baseline prompt tokens: **${baseline.promptTokens.toLocaleString()}**\n`;
  md += `- With deduplication: **${allFeatures.promptTokens.toLocaleString()}**\n`;
  md += `- **Savings: ${promptSavings}%** of prompt tokens\n`;
  md += `- Entries sent to LLM: ${baseline.entriesSent} → ${allFeatures.entriesSent}\n\n`;

  md += `### Reasoning Impact (completion tokens)\n`;
  md += `- Without reasoning: **${baseline.completionTokens}** completion tokens\n`;
  md += `- With reasoning: **${allFeatures.completionTokens}** completion tokens\n`;
  md += `- Additional cost: **+${completionCost}** completion tokens for reasoning + confidence scores\n\n`;

  md += `### Net Effect\n`;
  md += `- Total token savings (all features vs baseline): **${totalSavings}%**\n`;
  md += `- Latency difference: **${latencyDiff > 0 ? '+' : ''}${latencyDiff}ms**\n`;
  md += `- Correctness: ${allSameMatch ? '**All configurations returned the same match** ✓' : '⚠️ Configurations returned different matches — see details below'}\n\n`;

  md += `### Trade-off Summary\n\n`;
  md += `| Feature | Benefit | Token Cost |\n`;
  md += `|---|---|---|\n`;

  const dedupOnly = results.find((r) => r.dedup && !r.reasoning);
  const reasonOnly = results.find((r) => !r.dedup && r.reasoning);

  if (dedupOnly) {
    const saved = baseline.promptTokens - dedupOnly.promptTokens;
    md += `| Deduplication | ${((saved / baseline.promptTokens) * 100).toFixed(0)}% fewer prompt tokens (${baseline.entriesSent} → ${dedupOnly.entriesSent} entries) | -${saved.toLocaleString()} prompt tokens |\n`;
  }
  if (reasonOnly) {
    const added = reasonOnly.completionTokens - baseline.completionTokens;
    md += `| Reasoning + Confidence | AI transparency, candidate list with confidence scores | +${added} completion tokens |\n`;
  }

  md += `\n`;

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
