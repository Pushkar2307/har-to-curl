# HAR Reverse Engineer

A web application that allows users to upload a `.har` (HTTP Archive) file, describe the API they want to reverse-engineer, and receive a `curl` command to replicate the relevant API request. The backend uses an LLM to intelligently identify the most relevant request while keeping token usage efficient.

## Architecture

```
├── backend/          # NestJS API server (TypeScript)
│   ├── src/
│   │   ├── har/      # HAR parsing, analysis, and execution
│   │   │   ├── utils/
│   │   │   │   ├── har-parser.ts      # HAR file parsing & filtering
│   │   │   │   └── curl-generator.ts  # curl command generation
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
- Cap response to 500 tokens (index + reasoning + confidence-scored candidates)
- Use `gpt-4o-mini` by default for cost efficiency

**Result:** A typical analysis uses ~1,500-7,000 tokens total, compared to 50,000+ if the full HAR were sent. For example, an 87MB HAR file with 1,727 requests is processed with only ~7,000 tokens after filtering (1,473 removed) and deduplication (254 → 127 unique patterns).

### curl Generation

The curl command is generated programmatically (no LLM needed) from the matched HAR entry:
- HTTP method, full URL with query parameters
- All relevant headers (excluding auto-set ones like Host, Connection)
- Request body (for POST/PUT/PATCH requests)
- Proper shell escaping for safety

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/har/upload` | POST | Upload and parse a HAR file |
| `/api/har/analyze` | POST | Find matching request via LLM |
| `/api/har/execute` | POST | Execute request as server-side proxy |

## Important Notes on Request Execution

The "Execute" button replays the **exact request** captured in the HAR file. This works well for **stateless APIs** (e.g., public joke APIs, weather APIs) but may fail for **session-dependent APIs** with:

- **Session-specific tokens** — temporary IDs, CSRF tokens, or resource URIs generated during the original browsing session
- **Expired authentication** — cookies or auth tokens that are no longer valid
- **Rate limiting** — servers that restrict replayed requests

**This is expected behavior**, not a bug. The primary deliverable is the **curl command itself** — a reverse-engineered blueprint of the API. Users can:
1. Copy the curl command and run it in their terminal
2. Modify parameters (e.g., change `"calories":2000` to `"calories":1000`)
3. Use the request structure to integrate the API into their own code

For example, the RecipeCal API (`POST /api/bookapi`) returns `{"error": true}` when replayed because it uses session-specific `resource_uri` values. However, the curl command correctly reveals the full API structure: endpoint, method, headers, and the complete JSON body schema with nutrition profiles, meal configuration, and user preferences.

## Tech Stack

- **Frontend:** TypeScript, Next.js 15, Tailwind CSS v4, shadcn/ui
- **Backend:** TypeScript, NestJS 11
- **LLM:** OpenAI GPT-4o-mini (configurable)

## Features

- **Drag & drop HAR upload** with support for files up to 150MB
- **Request inspector** — browse all filtered API requests in a table
- **AI-powered matching** — LLM identifies the best-matching endpoint with reasoning and confidence scores
- **Smart deduplication** — reduces token usage by 80-90% by grouping duplicate endpoint patterns
- **curl generation** — programmatic curl command with all headers, query params, and request body
- **One-click execution** — test the API directly from the UI with a server-side proxy (15s timeout)
- **Transparency** — view AI reasoning, candidate evaluation with confidence bars, token usage, and LLM latency
