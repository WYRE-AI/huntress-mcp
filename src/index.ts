import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { logger } from './utils/logger.js';
import { bindServerRef } from './utils/server-ref.js';

const server = createServer();
bindServerRef(server);
const transport = new StdioServerTransport();
await server.connect(transport);
logger.info('Huntress MCP server started (stdio)');
