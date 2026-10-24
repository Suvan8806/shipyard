# Stack notes (verified 2026-10-24 against installed node_modules)

Installed: ai 7.0.153, @ai-sdk/anthropic 4.0.88, @ai-sdk/gateway 4.0.126, next 16.4.3, mcp-handler 2.3.0
(+ @modelcontextprotocol/server 2.4.0, auto-installed as a peer and NOT in package.json), @electric-sql/pglite 0.5.11,
postgres 3.4.9, zod 4.6.7. Every snippet below was typechecked with the repo tsconfig (`tsc --noEmit`). The mock-model
test and the MCP route were also run under Node 22.

## 1. ai@7 (Vercel AI SDK)
Source: `node_modules/ai/dist/index.d.ts`, `@ai-sdk/provider-utils/dist/index.d.ts`, `@ai-sdk/provider/dist/index.d.ts`.

- `tool({ description, inputSchema, execute })`: the field is **`inputSchema`** (`parameters` no longer exists).
  `execute(input, { toolCallId, abortSignal, messages, ... })`.
- zod@4 schemas work directly: `FlexibleSchema = Schema | LazySchema | ZodSchema | StandardSchema`.
- Stop condition: `stopWhen: stepCountIs(n)`. The canonical name is now `isStepCount`, and `stepCountIs` is an exported alias, so both work.
  Also exported: `hasToolCall(name)` and `isLoopFinished()`. With no `stopWhen`, the loop stops after one step.
- `system` is deprecated in favour of **`instructions`**. `onStepFinish` is deprecated in favour of **`onStepEnd`**, whose payload is a `StepResult`.
- Usage (`LanguageModelUsage`): `inputTokens`, `outputTokens` (number | undefined), `inputTokenDetails.{noCacheTokens,cacheReadTokens,cacheWriteTokens}`,
  `outputTokenDetails`. `result.usage` covers the last step only and `result.totalUsage` is the sum over all steps.
- History: **`result.responseMessages`** holds the messages from all steps. `result.response.messages` still exists but is deprecated
  ("use finalStep.response") and covers the last step only.
- `generateObject` is **deprecated**. Use `generateText({ output: Output.object({ schema }) })` and read `result.output`.
- `maxOutputTokens` (not `maxTokens`).

```ts
import { generateText, tool, stepCountIs, Output, type ModelMessage, type LanguageModelUsage } from 'ai';
import { anthropic, createAnthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

const model = anthropic('claude-sonnet-5-5');        // reads ANTHROPIC_API_KEY (and optional ANTHROPIC_BASE_URL)
const custom = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const tools = {
  query_db: tool({
    description: 'Run a read-only SQL query',
    inputSchema: z.object({ sql: z.string() }),
    execute: async ({ sql }, { toolCallId, abortSignal }) => ({ rows: [] as unknown[], sql }),
  }),
};

export async function run(history: ModelMessage[]) {
  const usages: LanguageModelUsage[] = [];
  const result = await generateText({
    model,                                   // or the gateway string 'anthropic/claude-sonnet-5-5'
    instructions: 'You are a careful agent.',
    messages: history,
    tools,
    stopWhen: stepCountIs(8),
    maxOutputTokens: 4000,
    providerOptions: { anthropic: { effort: 'low' } },   // low|medium|high|xhigh|max
    onStepEnd: (step) => {
      usages.push(step.usage);
      console.log(step.stepNumber, step.finishReason, step.toolCalls.map((c) => c.toolName),
        step.usage.inputTokens, step.usage.outputTokens);
    },
  });
  const next: ModelMessage[] = [...history, ...result.responseMessages];
  return { text: result.text, steps: result.steps.length, total: result.totalUsage, next };
}

const Verdict = z.object({ pass: z.boolean(), reason: z.string() });
const { output } = await generateText({ model: 'anthropic/claude-haiku-4-5', output: Output.object({ schema: Verdict }), prompt: '...' });
```

**Gateway strings** such as `'anthropic/claude-sonnet-5-5'` are accepted anywhere `model` is expected. They route through
`@ai-sdk/gateway`, which authenticates with **`AI_GATEWAY_API_KEY`** and falls back to the Vercel OIDC token (`VERCEL_OIDC_TOKEN`).
That token is automatic on Vercel deployments; locally, get it with `vercel env pull`.
Source: `@ai-sdk/gateway/dist/index.js` `getGatewayAuthToken`. With a direct `anthropic(...)` model, only `ANTHROPIC_API_KEY` is needed.

**Claude 5.5 quirks the provider already handles** (`@ai-sdk/anthropic/dist/index.js` ~L1845, L3656):
- Opus 5.5 and Sonnet 5.5 reject forced tool use. With `toolChoice: 'required'` or `{type:'tool'}` the provider **silently downgrades to
  `'auto'`** and adds a warning to `result.warnings`. Do not rely on forcing a tool: instruct the model in the prompt and check `toolCalls`.
- Structured output uses native `output_config.format` (`structuredOutputMode: 'auto'`), so `Output.object` works on 5.5 models.
- Thinking cannot be disabled on Opus 5.5. Control cost with `providerOptions.anthropic.effort`. Opus 5.5 defaults to `medium`; Sonnet 5.5 defaults to `high`.

**Mock model for tests.** Import from `ai/test`. Use `MockLanguageModelV4`: `@ai-sdk/anthropic` 4.x is a V4 provider, and V3 is also
exported. `doGenerate` accepts an **array** of results, consumed one per step. The run below returned `['done', 2, 2]`.
```ts
import { MockLanguageModelV4 } from 'ai/test';
const u = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 5, text: 5, reasoning: 0 } };
const mock = new MockLanguageModelV4({ doGenerate: [
  { content: [{ type: 'tool-call', toolCallId: 'c1', toolName: 'query_db', input: JSON.stringify({ sql: 'select 1' }) }],
    finishReason: { unified: 'tool-calls', raw: 'tool_use' }, usage: u, warnings: [] },
  { content: [{ type: 'text', text: 'done' }], finishReason: { unified: 'stop', raw: 'end_turn' }, usage: u, warnings: [] },
] });
const r = await generateText({ model: mock, tools, stopWhen: stepCountIs(5), prompt: 'go' });
// r.text === 'done', r.steps.length === 2, mock.doGenerateCalls.length === 2
```
Note: tool-call `input` is a **JSON string** and `finishReason` is an **object** (`{unified, raw}`) at the provider (V4) level.

## 2. Next.js 16.4 route handlers
Source: `node_modules/next/dist/docs/01-app/...` (route.md, 15-route-handlers.md, after.md, route-segment-config/*, proxy.md).

- **This repo has `cacheComponents: true`** (next.config.ts). Consequences:
  - A `GET` handler that touches no request data or I/O **gets prerendered at build time**. For DB-backed GETs, call `await connection()`
    (from `next/server`) first, or read `request`. POST is always dynamic.
  - **Do not export `runtime`**, not even `'nodejs'`: Cache Components rejects it. Edge is deprecated anyway.
  - `dynamic`, `revalidate` and `fetchCache` segment configs are removed. To cache, put `'use cache'` in a helper (never in the handler body).
- `params` is a **Promise**: `{ params }: { params: Promise<{ id: string }> }`, or the global helper `ctx: RouteContext<'/api/runs/[id]'>`.
- `after(cb)` is imported from **`next/server`**. It runs after the response is sent, even if the handler threw, and stays within the route's
  `maxDuration`. On Vercel it is backed by `waitUntil`. `headers()` and `cookies()` can be called inside `after` in route handlers.
- `export const maxDuration = 300` is in seconds. Vercel Fluid compute allows up to 800s on Pro; Hobby is capped at 300s.
- `middleware.ts` has been **renamed to `proxy.ts`** (`export function proxy(req)`). It runs on Node, and `runtime` is not allowed there.
- `serverExternalPackages: [...]` in next.config opts a package out of bundling. `outputFileTracingIncludes: { '/api/x': ['./node_modules/pkg/dist/*.wasm'] }`
  forces files into a function bundle (docs: next-config-js/output.md).

```ts
// app/api/runs/[id]/route.ts
import { after, connection, type NextRequest } from 'next/server';
export const maxDuration = 300;
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();                      // keep it dynamic under cacheComponents
  const { id } = await params;
  return Response.json({ id });
}
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body: unknown = await req.json();
  after(async () => { /* long agent work; still bounded by maxDuration */ });
  return Response.json({ ok: true }, { status: 202 });
}
```

## 3. mcp-handler 2.3
Source: `node_modules/mcp-handler/README.md`, `dist/index.d.ts`. **v2 breaking changes compared with tutorials you may remember:**
`registerTool` replaces `server.tool`; `inputSchema` takes a full `z.object(...)` instead of a raw shape; and **`basePath`, `maxDuration`,
`redisUrl` and SSE are removed**. The handler ignores the pathname, so mount it at any route. Options are a single object:
`createMcpHandler(init, { serverInfo, verboseLogs, onEvent, ...ServerOptions })`. Auth info is at `ctx.http?.authInfo` (formerly `extra.authInfo`).
Builders should ask the orchestrator to add `@modelcontextprotocol/server@^2` to package.json, since it is currently only an auto-installed peer.

```ts
// app/api/mcp/[transport]/route.ts  -> URL /api/mcp/mcp  (a plain app/api/mcp/route.ts works too)
import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import { z } from 'zod';
const handler = createMcpHandler((server) => {
  server.registerTool('list_runs', {
    title: 'List runs', description: 'List recent runs',
    inputSchema: z.object({ limit: z.number().int().min(1).max(50).default(10) }),
  }, async ({ limit }, ctx) => {
    const who = ctx.http?.authInfo?.clientId;
    return { content: [{ type: 'text', text: JSON.stringify({ limit, who }) }] };
  });
}, { serverInfo: { name: 'shipyard', version: '0.1.0' } });
const authed = withMcpAuth(handler, (_req, token) => {
  if (!token || token !== process.env.MCP_TOKEN) return undefined;   // -> 401 + WWW-Authenticate
  return { token, clientId: 'claude-code', scopes: [] };
}, { required: true });
export { authed as GET, authed as POST };
```
Runtime check: a request with no token got 401; `initialize` got 200 (SSE-framed JSON); `tools/call` returned the tool output.
Connect Claude Code with:
`claude mcp add --transport http -s user shipyard https://<app>.vercel.app/api/mcp/mcp --header "Authorization: Bearer $MCP_TOKEN"`

## 4. @electric-sql/pglite 0.5.11 (measured locally: Node 22, Windows)
```ts
import { PGlite } from '@electric-sql/pglite';
const db = await PGlite.create();                       // in-memory; ~1.2-1.5 s cold, ~570 MB RSS for the first instance
await db.exec(`create table t (id serial primary key, amt numeric(10,2), at timestamptz default now());
               insert into t(amt) values (1.5);`);      // multi-statement OK; returns Results[] (one per statement)
const r = await db.query<{ id: number; amt: string; at: Date }>('select * from t where id = $1', [1]);
await db.transaction(async (tx) => { await tx.query('insert into t(amt) values ($1)', [2]); });
await db.close();                                       // REQUIRED: unclosed instances keep Node alive (scripts and tests hang)
```
- Return types: `numeric` -> **string** ('12.50'), `timestamptz` -> **Date**, `int4` -> number, `jsonb` -> object, and
  **`int8`/`bigint`/`count(*)` -> BigInt**, which `JSON.stringify` throws on. Cast to int (`count(*)::int`) in SQL.
- Errors: `err.code` holds the SQLSTATE (e.g. `42P01`). The class name is minified, so match on `.code`, not `.constructor.name`.
- Memory: each additional `PGlite.create()` adds ~220 MB RSS. **`await base.clone()` takes ~370 ms and adds only ~10 MB.** Loading a
  `dumpDataDir()` snapshot with `PGlite.create({ loadDataDir })` takes ~330 ms (40 MB uncompressed dump). For per-run sandboxes: build one migrated base per
  warm function and `clone()` it for each run. Size Vercel functions at **≥ 2 GB memory** (vercel.json `functions.memory`, or the dashboard).
- Bundling: the package loads `pglite.wasm` (10 MB), `pglite.data` (6 MB) and `initdb.wasm` via `new URL('./x', import.meta.url)`.
  The PGlite docs only cover client-side Next (`transpilePackages`). For server routes on Vercel, use
  `serverExternalPackages: ['@electric-sql/pglite']` plus
  `outputFileTracingIncludes: { '/api/**': ['./node_modules/@electric-sql/pglite/dist/*.{wasm,data}'] }`.
  **This has not been proven on Vercel yet. Prove it in W0 with a one-route deploy** (https://pglite.dev/docs/bundler-support).
  It does not run on Edge.

## 5. postgres@3.4.9 + Supabase transaction pooler (port 6543)
Source: `node_modules/postgres/types/index.d.ts`, `src/types.js`.
```ts
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1, idle_timeout: 20 }); // prepare:false is REQUIRED on the tx pooler
const rows = await sql.unsafe<{ amt: string }[]>('select amt from t where id = $1', [1]);       // dynamic SQL + params
const tagged = await sql<{ id: number }[]>`select id from t where id = ${1}`;                   // tagged = auto-parameterized
await sql.begin(async (tx) => { await tx`...`; });
```
- Default parsers cover only int2/int4/oid/float (-> number), json/jsonb, bool, date/timestamp(tz) (-> Date) and bytea.
  **`numeric` and `int8` come back as strings.** PGlite returns int8 as BigInt, so the two engines disagree for bigint: cast in SQL.
- Keep one module-level client per function instance (`max: 1`) and never create one per request.

## 6. Models and prices (claude-api skill, table cached 2026-09-25; USD per 1M tokens, input / output)
| id | in | out | notes |
|---|---|---|---|
| `claude-opus-5-5` | 4.00 | 20.00 | thinking always on; effort default `medium`; cache read 0.20 |
| `claude-sonnet-5-5` | 2.00 | 10.00 | effort default `high`; cache read 0.20 |
| `claude-haiku-4-5` | 1.00 | 5.00 | 200K context; no `effort` |
`claude-haiku-5-5` appears in @ai-sdk/anthropic's model-id list but **not** in the skill's price table, so treat it as unverified.
Do not append date suffixes to these model ids. Gateway ids use the same names: `anthropic/claude-opus-5-5`.

## 7. Statistic check: VERIFIED
LangChain "State of Agent Engineering" (https://langchain.com/state-of-agent-engineering): **1,340 respondents**, surveyed
Nov 18 - Dec 2, 2025, published June 12, 2026. Quality is "the biggest barrier to production", with "32% citing it as a top barrier".
Companion stats from the same page: 57% have agents in production; 89% have observability, but only 52.4% run offline evals.
