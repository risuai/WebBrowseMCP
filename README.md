# A http-only MCP Server for controlling web browsers via Playwright

## Usage

Note that this is using `playwright` and does not install additional browsers. 

1. Install dependencies

```sh
% pnpm install
```

2. Run the MCP Server

```sh
% pnpm start
```

3. Go to **RisuAI** → Settings → Modules → Add module → Add new MCP server with the following uri:

```json
"http://localhost:7742/mcp"
```
