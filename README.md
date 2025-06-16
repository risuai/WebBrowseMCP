# A Express-HTTP MCP Server for controlling web browsers via Playwright

## Prerequsites

* Have Chrome/Firefox/Safari installed on your PC/Mac
* Open terminal/powershell to run shell commands

## Usage

Note that this is using `playwright` and does not install additional browsers. 

1. Install Nodejs

```sh
% sudo apt update
% sudo apt install nodejs npm
```

2. Install dependencies

```sh
% pnpm install
```

3. Run the MCP Server

```sh
% pnpm start
```

4. Go to **RisuAI** → Settings → Modules → Add module → Add new MCP server with the following uri:

```json
"http://localhost:7742/mcp"
```

## Browser configuration

* Change `browser.ts` file if you wish to change the browser profile location or launch commands
