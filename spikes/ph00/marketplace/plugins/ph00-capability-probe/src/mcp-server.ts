import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

export const STATUS = { phase: "PH-00", status: "probe", counter: 1 } as const;
export const PUBLIC_NONCE = "PH00_PUBLIC_NONCE";
export const UI_NONCE = "PH00_UI_NONCE";
const TEMPLATE_URI = "ui://ph00/status-v1.html";

export function statusResult() {
  return {
    structuredContent: STATUS,
    content: [{ type: "text" as const, text: JSON.stringify(STATUS) }]
  };
}

export function renderResult(status: { phase: string; status: string; counter: number }) {
  return {
    structuredContent: { ...status, visible_to_model: PUBLIC_NONCE },
    content: [{ type: "text" as const, text: `PH-00 status: ${status.status}` }],
    _meta: { ui_only_secret_test: UI_NONCE }
  };
}

const widgetHtml = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font:14px system-ui;margin:0;padding:12px;color:CanvasText;background:Canvas}main{border:1px solid GrayText;border-radius:10px;padding:12px}button{margin:4px 4px 0 0;padding:6px 10px}code{word-break:break-all}#message{min-height:1.4em}</style></head>
<body><main><h2>PH-00 capability probe</h2><p id="status">Waiting for tool result…</p><p>Model nonce: <code id="public">—</code></p><p>UI-only nonce: <code id="private">—</code></p>
<div><button id="call">Call tool</button><button id="follow">Follow up</button><button id="full">Fullscreen</button><button id="pip">PiP</button><button id="modal">Modal</button></div><p id="message" role="status" aria-live="polite"></p></main>
<script>
const pending=new Map();let id=1;const byId=(x)=>document.getElementById(x);const note=(x)=>byId("message").textContent=x;
function request(method,params){const requestId=id++;window.parent.postMessage({jsonrpc:"2.0",id:requestId,method,params},"*");return new Promise((resolve,reject)=>pending.set(requestId,{resolve,reject}));}
function render(data,meta){if(data){byId("status").textContent=data.phase+" / "+data.status+" / "+data.counter;byId("public").textContent=data.visible_to_model??"missing";}const hidden=meta?.ui_only_secret_test??window.openai?.toolResponseMetadata?.mcp_tool_result?._meta?.ui_only_secret_test;byId("private").textContent=hidden??"missing";}
window.addEventListener("message",(event)=>{if(event.source!==window.parent)return;const m=event.data;if(!m||m.jsonrpc!=="2.0")return;if(m.id!==undefined&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);return;}if(m.method==="ui/notifications/tool-result")render(m.params?.structuredContent,m.params?._meta);},{passive:true});
render(window.openai?.toolOutput,window.openai?.toolResponseMetadata?.mcp_tool_result?._meta);
byId("call").onclick=async()=>{try{const result=window.openai?.callTool?await window.openai.callTool("ph00_get_status",{}):await request("tools/call",{name:"ph00_get_status",arguments:{}});render(result?.structuredContent,result?._meta);note("Tool call succeeded");}catch(e){note("Tool call unavailable: "+(e.message??e));}};
byId("follow").onclick=async()=>{try{if(window.openai?.sendFollowUpMessage)await window.openai.sendFollowUpMessage({prompt:"Discuss PH-00 probe status in chat."});else await request("ui/message",{role:"user",content:[{type:"text",text:"Discuss PH-00 probe status in chat."}]});note("Follow-up sent");}catch(e){note("Follow-up unavailable: "+(e.message??e));}};
async function display(mode){try{if(!window.openai?.requestDisplayMode)throw new Error("feature not exposed");await window.openai.requestDisplayMode({mode});note(mode+" requested");}catch(e){note(mode+" unavailable: "+(e.message??e));}}
byId("full").onclick=()=>display("fullscreen");byId("pip").onclick=()=>display("pip");
byId("modal").onclick=async()=>{try{if(!window.openai?.requestModal)throw new Error("feature not exposed");await window.openai.requestModal({params:{kind:"PH00_SYNTHETIC_DECISION"}});note("Modal requested");}catch(e){note("Modal unavailable: "+(e.message??e));}};
</script></body></html>`;

export function createServer() {
  const server = new McpServer({ name: "ph00-capability-probe", version: "0.1.0" });
  server.registerResource("ph00-status-card", TEMPLATE_URI, {}, async () => ({ contents: [{ uri: TEMPLATE_URI, mimeType: "text/html;profile=mcp-app", text: widgetHtml, _meta: { ui: { prefersBorder: true } } }] }));
  server.registerTool("ph00_get_status", {
    title: "Get PH-00 status",
    description: "Return the deterministic PH-00 probe status without UI.",
    inputSchema: {},
    outputSchema: { phase: z.literal("PH-00"), status: z.literal("probe"), counter: z.literal(1) },
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
    _meta: { ui: { visibility: ["model", "app"] } }
  }, async () => statusResult());
  server.registerTool("ph00_render_status", {
    title: "Render PH-00 status",
    description: "Render status returned by ph00_get_status; call ph00_get_status first.",
    inputSchema: { phase: z.literal("PH-00"), status: z.literal("probe"), counter: z.literal(1) },
    outputSchema: { phase: z.literal("PH-00"), status: z.literal("probe"), counter: z.literal(1), visible_to_model: z.literal(PUBLIC_NONCE) },
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
    _meta: { ui: { resourceUri: TEMPLATE_URI, visibility: ["model", "app"] }, "openai/outputTemplate": TEMPLATE_URI, "openai/widgetAccessible": true }
  }, async (status) => renderResult(status));
  return server;
}

async function main() {
  await createServer().connect(new StdioServerTransport());
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
