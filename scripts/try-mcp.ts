// Connects to the Shipyard MCP server, lists tools and calls a couple of read-only ones.
// Usage: npx tsx scripts/try-mcp.ts [base-url]   (default SHIPYARD_API_URL or http://localhost:3000)
// Env: SHIPYARD_ADMIN_TOKEN (sent as bearer if set), VERCEL_BYPASS (x-vercel-protection-bypass for protected previews)
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

async function main() {
  const base = (process.argv[2] ?? process.env.SHIPYARD_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  const url = new URL(`${base}/api/mcp/mcp`);
  const headers: Record<string, string> = {};
  if (process.env.SHIPYARD_ADMIN_TOKEN) headers.Authorization = `Bearer ${process.env.SHIPYARD_ADMIN_TOKEN}`;
  if (process.env.VERCEL_BYPASS) headers['x-vercel-protection-bypass'] = process.env.VERCEL_BYPASS;

  const client = new Client({ name: 'try-mcp', version: '0.1.0' });
  await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers } }));
  const { tools } = await client.listTools();
  console.log(`connected to ${url.href}: ${tools.length} tools`);
  for (const t of tools) console.log(`  - ${t.name}: ${(t.description ?? '').split('\n')[0].slice(0, 90)}`);

  for (const name of ['list_test_packs', 'list_library', 'list_agents']) {
    const r = await client.callTool({ name, arguments: {} });
    const content = r.content as { type: string; text?: string }[];
    const body = content.map((c) => c.text ?? '').join('');
    console.log(`\n${name}${r.isError ? ' (ERROR)' : ''}: ${body.slice(0, 400)}${body.length > 400 ? '…' : ''}`);
  }
  await client.close();
  if (tools.length < 13) {
    console.error(`expected >= 13 tools, got ${tools.length}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
