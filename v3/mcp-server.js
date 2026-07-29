const mcp = {
  port: undefined,
  log: false
};
mcp.socket = async () => {
  const ua = navigator.userAgent;
  const isWindows = navigator.userAgentData?.platform === 'Windows' || navigator.platform.startsWith('Win');

  const prefix = isWindows ? '\\\\.\\pipe\\exb-' : '/tmp/exb-';

  const prefs = await chrome.storage.local.get({
    'mcp-socket-postfix': ''
  });
  const postfix = prefs['mcp-socket-postfix'].replace(/[^A-Za-z0-9._-]/g, '').slice(0, 32);
  const suffix = (postfix ? '-' + postfix : '') + '.sock';

  if (ua.indexOf('Firefox') > -1) {
    return prefix + 'firefox' + suffix;
  }
  else if (ua.indexOf('Edg') > -1) {
    return prefix + 'edge' + suffix;
  }
  else if (ua.indexOf('OPR') > -1 || ua.indexOf('Opera') > -1) {
    return prefix + 'opera' + suffix;
  }
  else if (ua.indexOf('Chrome') > -1 && ua.indexOf('Edg') === -1) {
    return prefix + 'chrome' + suffix;
  }
  return prefix + 'unknown' + suffix;
};

// fetch extra tools from other extensions; called once the socket is ready
mcp.tools = async () => {
  const prefs = await chrome.storage.local.get({
    'mcp-extensions': []
  });

  for (const id of prefs['mcp-extensions']) {
    try {
      const r = await chrome.runtime.sendMessage(id, {cmd: 'mcp.json'});
      mcp.extraTools.set(id, r.result.tools);
      console.info('MCP: adding tools from extension', id, r.result.tools.map(t => t.name));
    }
    catch (e) {
      console.warn('MCP: cannot add tools for', id, e);
    }
  }
};

mcp.install = async () => {
  mcp.extraTools = new Map();
  const socketPath = await mcp.socket();
  const oldSocketPath = mcp.path && mcp.path !== socketPath ? mcp.path : '';
  mcp.path = socketPath;

  const prefs = await chrome.storage.local.get({
    'mcp-log': false
  });
  mcp.log = prefs['mcp-log'];

  const port = mcp.port = chrome.runtime.connectNative('com.add0n.node');
  const uuid = crypto.randomUUID();

  port.onDisconnect.addListener(() => {
    console.error('MCP is disconnected', chrome.runtime.lastError);
    delete mcp.port;
  });
  port.onMessage.addListener(request => {
    if (request.cmd === 'async.run') {
      let extensionId;
      let message;

      const post = response => {
        port.postMessage({
          cmd: 'post-message',
          uuid,
          data: {
            cmd: 'send',
            data: {
              jsonrpc: '2.0',
              result: {
                structuredContent: {
                  response
                }
              },
              id: request.id
            }
          }
        });
      };

      if (request.params.name === 'chrome_send_message') {
        extensionId = request.params.arguments.extensionId;
        message = request.params.arguments.message;
      }
      else {
        for (const [id, tools] of mcp.extraTools.entries()) {
          for (const tool of tools) {
            if (tool.name === request.params.name) {
              message = request.params.arguments;
              extensionId = id;
              break;
            }
          }
          if (message) {
            break;
          }
        }
      }
      if (!message) {
        return post({
          error: 'cannot find tool: ' + request.params.name
        });
      }

      try {
        console.info('running', extensionId, message);
        const eport = chrome.runtime.connect(extensionId);

        port.onDisconnect.addListener(() => {
          eport.disconnect();
        });

        eport.onMessage.addListener(post);
        eport.onDisconnect.addListener(() => {
          const e = chrome.runtime.lastError;
          post({
            error: e?.message || 'extension port is disconnected'
          });
        });
        eport.postMessage(message);
      }
      catch (e) {
        console.error(e);
      }
    }
    else if (request.type === 'report' || request.cmd === 'report') {
      if (request.state === 'socket-ready') {
        console.info('MCP server is ready. Unix socket path:', socketPath);
        // the socket is up; fetch extra tools and pass them to the script
        mcp.tools().then(() => port.postMessage({
          cmd: 'post-message',
          uuid,
          data: {
            cmd: 'set-tools',
            tools: [...mcp.extraTools.values()].flat()
          }
        }));
      }
      else if (request.state === 'tools-ready') {
        console.info('MCP tools are ready:', request.tools);
      }
      else if (mcp.log) {
        console.info(request);
      }
    }
    else {
      console.info('unknown request', request);
    }
  });

  // register the Unix domain socket and observe it
  port.postMessage({
    permissions: ['net', 'fs', 'crypto'],
    args: [socketPath, oldSocketPath],
    uuid,
    script: `
const net = require("net");
const fs = require("fs");
const crypto = require("crypto");

const socketPath = args[0];

if (fs.existsSync(socketPath)) {
  fs.unlinkSync(socketPath);
}
// remove the stale socket file of a previous run (e.g. postfix changed)
if (args[1] && args[1] !== socketPath && fs.existsSync(args[1])) {
  fs.unlinkSync(args[1]);
}

const tools = [{
  name: "chrome_send_message",
  description: "Send a message using chrome.runtime.sendMessage",
  inputSchema: {
    type: "object",
    properties: {
      message: { type: "object" },
      extensionId: { type: "string" }
    },
    required: ["extensionId", "message"]
  }
}];

// receive extra tools from the extension once they are loaded
connect(msg => {
  if (msg.cmd === "set-tools" && Array.isArray(msg.tools)) {
    tools.length = 1;
    for (const tool of msg.tools) {
      tools.push(tool);
    }
    push({
      cmd: "report",
      state: "tools-ready",
      tools: tools.map(t => t.name)
    });
  }
});

const rpc = {
  message(id, result) {
    return {
      jsonrpc: "2.0",
      result,
      id
    };
  },
  error(id, code, message) {
    return {
      jsonrpc: "2.0",
      error: { code, message },
      id
    };
  }
};

function handleRequest(req, uuid) {
  const { method, params, id } = req;

  push({ cmd: "report", state: method, uuid });

  switch (method) {
    case "initialize":
      return rpc.message(id, {
        protocolVersion: "2025-11-25",
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: "chrome-runtime-service",
          version: "0.0.1"
        }
      });

    case "notifications/initialized":
    case "notifications/cancelled":
      return null;

    case "tools/list":
      return rpc.message(id, { tools });

    case "tools/call":
      if (tools.find(t => t.name === params?.name)) {
        push({
          cmd: "async.run",
          params,
          id
        });
        return null;
      }
      else {
        return rpc.error(
          id,
          -32601,
          'Tool not found: ' + params?.name
        );
      }

    case "shutdown":
      return rpc(id, null);

    default:
      return rpc.error(
        id,
        -32601,
        'Method not found: ' + method
      );
  }
}

const server = net.createServer(socket => {
  const uuid = crypto.randomUUID();
  let buffer = "";

  push({
    cmd: "report",
    state: "new-connection",
    uuid
  });

  connect(msg => {
    if (msg.cmd === "send") {
      socket.write(JSON.stringify(msg.data) + "\\n");
    }
    else if (msg.cmd !== "set-tools") {
      push({
        cmd: "error",
        message: msg.cmd + ' command is not known by this script'
      });
    }
  });

  socket.on("data", chunk => {
    buffer += chunk;

    let line;
    while ((line = buffer.indexOf("\\n")) !== -1) {
      const text = buffer.slice(0, line).trim();
      buffer = buffer.slice(line + 1);

      if (!text)
        continue;

      try {
        const req = JSON.parse(text);

        if (req.jsonrpc !== "2.0" || !req.method) {
          socket.write(
            JSON.stringify(
              rpc.error(req.id ?? null, -32600, "Invalid Request")
            ) + "\\n"
          );
          continue;
        }

        const response = handleRequest(req, uuid);

        if (response) {
          socket.write(JSON.stringify(response) + "\\n");
        }
      }
      catch (e) {
        push({
          cmd: "error",
          message: e.message
        });

        socket.write(
          JSON.stringify(
            rpc.error(null, -32700, "Parse error")
          ) + "\\n"
        );
      }
    }
  });

  socket.on("end", () => {
    push({ cmd: "done", uuid });
  });

  socket.on("error", e => {
    push({
      cmd: "error",
      message: e.message
    });
  });
});

server.listen(socketPath, () => {
  push({
    cmd: "report",
    state: "socket-ready"
  });
});
`
  });
};
mcp.uninstall = () => {
  mcp.port?.disconnect();
  delete mcp.port;
  delete mcp.extraTools;
};
