import express from "express";
import http from 'http';
import { Browser } from 'playwright';
import { initBrowser } from './browser.ts';
import { toolsList } from './tools/toolsList.ts';
import { handleToolCall } from './tools/toolHandlers.ts';

const port = 7742;

function setupRoutes(app: express.Express, browser: Browser) {
  let httpOnlySession: { initialized: boolean } | null = null;

  async function ensureSessionInitialized() {
    if (!httpOnlySession) {
      httpOnlySession = { initialized: true };
    }
    return httpOnlySession;
  }

  app.post("/mcp", async (req: express.Request, res: express.Response) => {
    try {
      const mcpRequest = req.body;

      if (mcpRequest && mcpRequest.method) {
        let result;

        switch (mcpRequest.method) {
          case 'initialize':
            if (!httpOnlySession) {
              httpOnlySession = { initialized: false };
            }

            result = {
              jsonrpc: "2.0",
              id: mcpRequest.id,
              result: {
                protocolVersion: "2025-03-26",
                capabilities: {
                  tools: {},
                  resources: {},
                  prompts: {},
                  logging: {}
                },
                serverInfo: {
                  name: 'Web browsing MCP',
                  version: '1.0.0',
                  description: 'Allows web browser control and internet connections',
                }
              }
            };
            break;

          case 'notifications/initialized':
            if (httpOnlySession) {
              httpOnlySession.initialized = true;
            }

            result = {
              jsonrpc: "2.0",
              id: mcpRequest.id,
              result: null
            };
            break;

          case 'tools/list':
            await ensureSessionInitialized();

            result = {
              jsonrpc: "2.0",
              id: mcpRequest.id,
              result: {
                tools: toolsList
              }
            };
            break;

          case 'tools/call':
            await ensureSessionInitialized();

            const params = mcpRequest.params;
            const toolName = params?.name;
            const toolArguments = params?.arguments || {};

            try {
              const toolResult = await handleToolCall(toolName, toolArguments, browser, httpOnlySession!);

              result = {
                jsonrpc: "2.0",
                id: mcpRequest.id,
                result: {
                  content: toolResult.content || [{ type: "text", text: "Tool executed successfully" }]
                }
              };
            } catch (error) {
              result = {
                jsonrpc: "2.0",
                id: mcpRequest.id,
                error: {
                  code: -32603,
                  message: `Tool execution failed: ${error.message}`,
                  data: {
                    toolName: toolName,
                    arguments: toolArguments
                  }
                }
              };
            }
            break;

          default:
            result = {
              jsonrpc: "2.0",
              id: mcpRequest.id,
              error: {
                code: -32601,
                message: `Method not found: ${mcpRequest.method}`
              }
            };
        }

        res.json(result);

      } else {
        res.status(400).json({
          jsonrpc: "2.0",
          id: mcpRequest?.id || null,
          error: {
            code: -32600,
            message: "Invalid Request"
          }
        });
      }

    } catch (error) {
      res.status(500).json({
        jsonrpc: "2.0",
        id: req.body?.id || null,
        error: {
          code: -32603,
          message: "Internal error"
        }
      });
    }
  });

  app.get("/health", (req: express.Request, res: express.Response) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.get("/", (req: express.Request, res: express.Response) => {
    res.json({
      name: 'Web browsing MCP(Playwright)',
      version: '1.0.0',
      description: "MCP server for controlling web browsers via Playwright (Single user support)",
      endpoints: {
        mcp: "/mcp - MCP protocol endpoint",
        health: "/health - Health check"
      }
    });
  });
}

async function main() {
  const browserType = (process.env.BROWSER_TYPE as 'chrome' | 'firefox' | 'webkit') || 'chrome';
  const browser = await initBrowser(browserType);
  
  const app = express();

  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    
    next();
  });

  app.use(express.json());

  setupRoutes(app, browser);

  const server = http.createServer(app);
  server.timeout = 0;
  server.keepAliveTimeout = 0;

  server.listen(port, () => {
    console.log(`MCP server listening at http://localhost:${port}/mcp`);
  });
}

main().catch(console.error);