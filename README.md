# HAR Reverse Engineer

A web application that allows users to upload a `.har` (HTTP Archive) file, describe the API they want to reverse-engineer, and receive a `curl` command to replicate the relevant API request. The backend uses an LLM to intelligently identify the most relevant request while keeping token usage efficient.

## Architecture

```
├── backend/          # NestJS API server (TypeScript)
│   ├── src/
│   │   ├── har/      # HAR parsing, analysis, and execution
│   │   │   ├── utils/
│   │   │   │   ├── har-parser.ts      # HAR file parsing & filtering
│   │   │   │   ├── curl-generator.ts  # curl command generation
│   │   │   │   └── url-validator.ts   # SSRF protection & URL validation
│   │   │   ├── har.controller.ts      # API endpoints
│   │   │   ├── har.service.ts         # Business logic
│   │   │   └── dto/                   # Request/response DTOs
│   │   └── llm/      # OpenAI LLM integration
│   │       └── llm.service.ts         # Token-efficient LLM queries
│   └── ...
├── frontend/         # Next.js web app (TypeScript)
│   ├── src/
│   │   ├── app/           # Next.js App Router
│   │   ├── components/    # React components
│   │   │   ├── FileUpload.tsx         # Drag & drop HAR upload
│   │   │   ├── RequestInspector.tsx   # Request table/inspector
│   │   │   ├── CurlDisplay.tsx        # curl command display
│   │   │   └── ResponseViewer.tsx     # API response viewer
│   │   ├── lib/           # Utilities & API client
│   │   └── types/         # TypeScript interfaces
│   └── ...
├── scripts/          # Automation
│   └── ablation.ts        # Ablation study runner
├── reports/          # Generated ablation reports (markdown)
└── .env.example      # Environment variable template
```

## Prerequisites

- **Node.js** >= 18
- **npm** >= 9
- **OpenAI API key** ([Get one here](https://platform.openai.com/api-keys))

## Setup

### 1. Clone and install dependencies

```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Configure environment variables

```bash
# From the project root
cp .env.example backend/.env
```

Edit `backend/.env` and add your OpenAI API key:

```
OPENAI_API_KEY=sk-your-actual-api-key
```

### 3. Start the application

In two separate terminal windows:

```bash
# Terminal 1: Start the backend (port 3001)
cd backend
npm run start:dev

# Terminal 2: Start the frontend (port 3000)
cd frontend
npm run dev
```

Then open **http://localhost:3000** in your browser.

### 4. Run tests

```bash
cd backend
npm test          # Run unit tests (50 tests across 3 suites)
npm run test:cov  # Run with coverage report
```

Tests cover the core utility modules: HAR parsing & filtering, curl generation, and SSRF URL validation (~97% line coverage on `src/har/utils/`).

## How It Works

### Token Efficiency Strategy

The key design challenge is keeping LLM token usage low while accurately identifying the right API request from potentially hundreds of HAR entries.

**Pre-filtering (zero tokens):**
1. Remove HTML responses (the target API never returns HTML)
2. Remove static assets (images, CSS, JS, fonts) by MIME type and URL extension
3. Remove known tracking/analytics domains (Google Analytics, Facebook Pixel, etc.)
4. Remove redirects (3xx), preflight OPTIONS requests, and data/blob URLs

**Deduplication & compact summarization:**
- Entries with the same method + URL path + parameter names are grouped (e.g., the same API called 50 times → 1 line with `[x50]`)
- Query parameter values are stripped — only names are kept (the LLM needs to know *what* an endpoint accepts, not the specific values)
- Each unique pattern becomes a single line: `[index] METHOD URL?param=... → STATUS (type, size) [xN]`
- This typically reduces 250+ entries to 20-40 unique patterns

**Targeted LLM query:**
- Send only the deduplicated compact summary (not full headers/bodies) to the LLM
- Use low temperature (0.1) for deterministic results
- Cap response tokens dynamically based on enabled features (150 minimal, +200 for candidates, +150 for reasoning)
- Use `gpt-4o-mini` by default for cost efficiency

**Result:** A typical analysis uses ~1,500-7,000 tokens total, compared to 50,000+ if the full HAR were sent. For example, an 87MB HAR file with 1,727 requests is processed with only ~7,000 tokens after filtering (1,473 removed) and deduplication (254 → 127 unique patterns).

### curl Generation

The curl command is generated programmatically (no LLM needed) from the matched HAR entry:
- HTTP method, full URL with query parameters (only `http:`/`https:` URLs are permitted)
- All relevant headers (excluding auto-set ones like Host, Connection); sensitive headers (e.g. Authorization, Cookie) are shown as `[REDACTED]` in the displayed curl
- Request body (for POST/PUT/PATCH requests)
- Proper shell escaping for safety

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/har/upload` | POST | Upload and parse a HAR file |
| `/api/har/analyze` | POST | Find matching request via LLM |
| `/api/har/execute` | POST | Execute request as server-side proxy |

## Important Notes on Request Execution

The "Execute" button replays the **exact request** captured in the HAR file. This works well for **stateless APIs** but may fail for **session-dependent APIs** with:

- **Session-specific tokens** — temporary IDs, CSRF tokens, or resource URIs generated during the original browsing session
- **Expired authentication** — cookies or auth tokens that are no longer valid
- **Rate limiting** — servers that restrict replayed requests

**This is expected behavior**, not a bug. The primary deliverable is the **curl command itself** — a reverse-engineered blueprint of the API that users can copy, modify, and integrate into their own code.

## Tech Stack

- **Frontend:** TypeScript, Next.js 15, Tailwind CSS v4, shadcn/ui
- **Backend:** TypeScript, NestJS 11
- **LLM:** OpenAI GPT-4o-mini (configurable)

## Features

- **Drag & drop HAR upload** with support for files up to 150MB
- **Request inspector** — browse all filtered API requests in a table, with tabs for filtered vs all entries
- **AI-powered matching** — LLM identifies the best-matching endpoint
- **curl generation** — programmatic curl command with all headers, query params, and request body
- **One-click execution** — test the API directly from the UI via a server-side proxy (30s timeout)

## Bonus Features

### Token Efficiency
- **Smart deduplication & URL compaction** — groups duplicate endpoint patterns and strips query parameter values, reducing token usage by 80-90% on large HAR files (e.g., 42K → 7K tokens on an 87MB file with 1,727 requests)
- **Body stripping** — removes response bodies and truncates large request bodies from stored entries to keep memory usage low on 50MB+ HAR files
- **Configurable feature flags** — `deduplication`, `candidates`, and `reasoning` flags on the `/analyze` endpoint allow fine-tuning the cost vs explainability trade-off without code changes (all default to current optimal config)

### Ablation Study
- **Automated ablation script** (`scripts/ablation.ts`) that tests all 7 flag combinations across any HAR file and generates a markdown comparison report
- **Isolated feature cost measurement** — each feature's token cost is measured independently (e.g., candidates cost +200-260 tokens, reasoning text costs +80-95 tokens, dedup saves up to 35K tokens)
- **Data-driven config decision** — ablation results showed reasoning text adds ~80-95 tokens for limited end-user value, so the default UI ships with candidates on + reasoning off — saving tokens without losing visual explainability
- **100% accuracy across all 28 runs** (7 configs x 4 HAR files) — feature flags do not affect match correctness
- Reports for all assignment use cases are in `reports/`

### AI Transparency & UX
- **Candidate evaluation with confidence bars** — ranked alternative matches with color-coded confidence scores (High/Likely/Possible/Unlikely)
- **Deduplication stats banner** — shows users how many entries were condensed ("254 API requests condensed into 127 unique patterns")
- **Token usage display** — prompt, completion, and total token counts visible in the UI
- **LLM latency display** — shows how long the LLM API call took

### Security
- **SSRF protection** — URL validation with DNS rebinding prevention blocks requests to private IPs, cloud metadata endpoints, and non-HTTP protocols
- **Sensitive header redaction** — the displayed/copied curl command redacts `Authorization`, `Cookie`, `X-Api-Key`, and similar headers as `[REDACTED]`; Execute still sends the real headers so requests work
- **URL scheme enforcement** — only `http:` and `https:` URLs are allowed when generating curl; matched entries with `javascript:`, `data:`, etc. are rejected
- **HAR entry cap** — uploads are limited to 50,000 entries per file to prevent DoS from extremely large HARs
- **Rate limiting** — 20 requests per 60 seconds via NestJS throttler
- **Security headers** — Helmet.js for standard HTTP security headers (CSP, HSTS, etc.)
- **Input validation** — class-validator DTOs on all endpoints with whitelist mode

### Execution
- **Server-side proxy** — avoids CORS issues when testing API calls from the browser
- **30s timeout** with informative error messages guiding users to try the curl command directly
- **Full request detail passthrough** — headers and body from the original HAR entry are preserved for accurate replay
