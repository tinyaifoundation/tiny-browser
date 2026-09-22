import { createServer } from "node:http";
import { logging, server as wisp } from "@mercuryworkshop/wisp-js/server";

const port = Number(process.env.TINYBROWSER_WISP_PORT ?? 8080);

// Web TCP only. Direct IPs, port 5173, and loopback are enabled solely for the
// bundled local test page; remove them before exposing this relay beyond localhost.
wisp.options.port_whitelist = [80, 443, 5173, 5174, 5175, 5176, 5177, 5178, 5179];
wisp.options.allow_udp_streams = false;
wisp.options.allow_direct_ip = true;
wisp.options.allow_private_ips = false;
wisp.options.allow_loopback_ips = true;
logging.set_level(logging.WARN);

const server = createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, service: "tinybrowser-wisp" }));
    return;
  }

  response.writeHead(404, { "content-type": "text/plain" });
  response.end("TinyBrowser Wisp relay");
});

server.on("upgrade", (request, socket, head) => {
  if (request.url?.startsWith("/wisp/")) {
    wisp.routeRequest(request, socket, head);
    return;
  }
  socket.destroy();
});

server.listen(port, "127.0.0.1", () => {
  console.log(`TinyBrowser Wisp relay listening at ws://127.0.0.1:${port}/wisp/`);
});
