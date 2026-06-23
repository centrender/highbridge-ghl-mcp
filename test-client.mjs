// Minimal MCP stdio client: boots the server, lists tools, optionally calls one.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { resolve } from "path";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [resolve("src/index.js")],
  cwd: process.cwd(),
});

const client = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: {} });
await client.connect(transport);

const { tools } = await client.listTools();
console.log(`TOOLS REGISTERED: ${tools.length}`);

// Optional single tool call:  node test-client.mjs call <tool> '<json args>'
if (process.argv[2] === "call") {
  const name = process.argv[3];
  const args = process.argv[4] ? JSON.parse(process.argv[4]) : {};
  const res = await client.callTool({ name, arguments: args });
  console.log(JSON.stringify(res, null, 2));
} else {
  console.log(tools.map((t) => t.name).sort().join("\n"));
}

await client.close();
process.exit(0);
