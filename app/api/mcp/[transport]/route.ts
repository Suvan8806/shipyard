// W0 STUB: minimal hosted MCP server (Streamable HTTP). Lane C adds the PRD 14 tools over lib/services/*.
import { createMcpHandler } from 'mcp-handler';
import { z } from 'zod';

export const maxDuration = 300;

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      'ping',
      {
        title: 'Ping',
        description: 'Health check for the Shipyard MCP server.',
        inputSchema: z.object({}),
      },
      async () => ({ content: [{ type: 'text', text: 'pong from Shipyard' }] }),
    );
  },
  { serverInfo: { name: 'shipyard', version: '0.1.0' } },
);

export { handler as GET, handler as POST, handler as DELETE };
