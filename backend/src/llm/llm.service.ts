import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly openai: OpenAI;
  private readonly model: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }

    this.openai = new OpenAI({ apiKey });
    this.model = this.configService.get<string>('OPENAI_MODEL') || 'gpt-4o-mini';
  }

  /**
   * Identify the best-matching API request from a list of HAR entry summaries.
   *
   * Token efficiency strategy:
   * - We only send compact one-line summaries (method + URL + status + type)
   * - We ask the LLM to return just the index number
   * - This keeps prompt + response tokens minimal
   *
   * @param entrySummary - Compact text summary of filtered HAR entries
   * @param userDescription - User's natural language description of the API
   * @returns The index of the best-matching entry and an explanation
   */
  async identifyRequest(
    entrySummary: string,
    userDescription: string,
  ): Promise<{
    index: number;
    explanation: string;
    reasoning: string;
    candidates: Array<{ index: number; url: string; reason: string; confidence: number }>;
    tokenUsage: { prompt: number; completion: number; total: number };
    model: string;
  }> {
    const systemPrompt = `You are an expert at analyzing HTTP traffic. You will be given a deduplicated list of HTTP requests captured from a browser session (HAR file), and a user's description of an API they want to find.

Each request is formatted as:
[index] METHOD URL → STATUS (content-type, size) [xN]

Notes:
- Query parameter VALUES are replaced with "..." — focus on the parameter NAMES and URL path to understand what the endpoint does.
- [xN] means this same endpoint pattern was called N times in the session.
- The index refers to one representative request for that pattern.

Your task:
1. Scan through all the requests and identify potential candidates that could match the user's description.
2. Focus on API endpoints that return data (JSON, XML) — not static assets, HTML pages, or tracking pixels.
3. Pay attention to URL path patterns and query parameter names that suggest the described functionality.
4. Pick the best match from your candidates.

Return your answer as JSON with these fields:
- "reasoning": A brief step-by-step explanation of how you analyzed the requests (2-4 sentences describing your thought process)
- "candidates": An array of the top 2-3 candidate matches, each with "index", "url" (shortened), "reason" (why it could match), and "confidence" (0-100 integer representing how confident you are that this is the correct match)
- "index": The integer index of the single best match
- "explanation": A 1-2 sentence summary of why this is the best match

Confidence scoring guide: 90-100 = almost certainly the right endpoint, 70-89 = likely correct, 50-69 = possible but uncertain, below 50 = unlikely but worth mentioning.

Respond ONLY with valid JSON. No markdown, no code fences.`;

    const userPrompt = `User wants to find: "${userDescription}"

Here are the captured HTTP requests:
${entrySummary}`;

    this.logger.log(
      `Querying LLM (${this.model}) with ${entrySummary.split('\n').length} entries`,
    );

    const response = await this.openai.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1, // Low temperature for deterministic matching
      max_tokens: 500, // Room for reasoning + candidates + answer
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      throw new Error('LLM returned an empty response');
    }

    this.logger.log(
      `LLM usage: ${response.usage?.prompt_tokens} prompt + ${response.usage?.completion_tokens} completion = ${response.usage?.total_tokens} total tokens`,
    );

    try {
      // Try to extract JSON from the response (handle potential markdown fences)
      const jsonStr = content.replace(/```json?\s*/g, '').replace(/```/g, '').trim();
      const result = JSON.parse(jsonStr);

      if (typeof result.index !== 'number') {
        throw new Error('LLM response missing "index" field');
      }

      return {
        index: result.index,
        explanation: result.explanation || 'Match found.',
        reasoning: result.reasoning || '',
        candidates: result.candidates || [],
        tokenUsage: {
          prompt: response.usage?.prompt_tokens ?? 0,
          completion: response.usage?.completion_tokens ?? 0,
          total: response.usage?.total_tokens ?? 0,
        },
        model: this.model,
      };
    } catch (error) {
      this.logger.error(`Failed to parse LLM response: ${content}`);
      throw new Error(`Failed to parse LLM response: ${error.message}`);
    }
  }
}
