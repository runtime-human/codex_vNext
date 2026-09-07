import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const TOOL_NAME = 'tp02a.storage_probe';

function probeRoot() {
  const pluginData = process.env.PLUGIN_DATA;
  if (!pluginData) throw new Error('PLUGIN_DATA is not set');
  const root = path.resolve(pluginData);
  const probe = path.resolve(root, 'tp02a');
  if (probe !== path.join(root, 'tp02a'))
    throw new Error('probe path escaped PLUGIN_DATA');
  return probe;
}

function noncePath(root, nonce) {
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(nonce)) throw new Error('invalid nonce');
  return path.join(root, `${nonce}.verified`);
}

function openProbeDatabase(root) {
  return new DatabaseSync(path.join(root, 'probe.sqlite3'), {
    timeout: 5_000,
    defensive: true,
    allowExtension: false,
  });
}

function write(nonce) {
  const root = probeRoot();
  fs.mkdirSync(root, { recursive: true });
  const initial = path.join(root, `${nonce}.tmp`);
  const renamed = noncePath(root, nonce);
  fs.writeFileSync(initial, `${nonce}\n`, { flag: 'wx' });
  fs.appendFileSync(initial, `${nonce}\n`);
  fs.renameSync(initial, renamed);
  const filePass = fs.readFileSync(renamed, 'utf8') === `${nonce}\n${nonce}\n`;

  let db = openProbeDatabase(root);
  db.exec('CREATE TABLE IF NOT EXISTS probe (nonce TEXT PRIMARY KEY) STRICT');
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('INSERT OR REPLACE INTO probe (nonce) VALUES (?)').run(nonce);
    db.exec('COMMIT');
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK');
    throw error;
  } finally {
    db.close();
  }

  db = openProbeDatabase(root);
  const sqlitePass =
    db.prepare('SELECT nonce FROM probe WHERE nonce = ?').get(nonce)?.nonce ===
    nonce;
  db.close();
  if (!filePass || !sqlitePass) throw new Error('probe readback failed');
  return {
    pluginDataPresent: true,
    create: 'pass',
    append: 'pass',
    rename: 'pass',
    read: 'pass',
    sqliteTransaction: 'pass',
    sqliteReopen: 'pass',
  };
}

function verify(nonce) {
  const root = probeRoot();
  const filePass =
    fs.readFileSync(noncePath(root, nonce), 'utf8') === `${nonce}\n${nonce}\n`;
  const db = openProbeDatabase(root);
  const sqlitePass =
    db.prepare('SELECT nonce FROM probe WHERE nonce = ?').get(nonce)?.nonce ===
    nonce;
  db.close();
  if (!filePass || !sqlitePass)
    throw new Error('restart persistence verification failed');
  return { pluginDataPresent: true, restartPersistence: 'pass' };
}

function cleanup() {
  const root = probeRoot();
  fs.rmSync(root, { recursive: true, force: true });
  return { pluginDataPresent: true, cleanup: 'pass' };
}

function execute(args) {
  if (
    !args ||
    typeof args !== 'object' ||
    typeof args.mode !== 'string' ||
    typeof args.nonce !== 'string'
  ) {
    throw new Error('mode and nonce are required');
  }
  if (args.mode === 'write') return write(args.nonce);
  if (args.mode === 'verify') return verify(args.nonce);
  if (args.mode === 'cleanup') return cleanup();
  throw new Error('unsupported mode');
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function result(id, value) {
  send({
    jsonrpc: '2.0',
    id,
    result: {
      structuredContent: value,
      content: [{ type: 'text', text: JSON.stringify(value) }],
    },
  });
}

let buffered = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffered += chunk;
  for (;;) {
    const newline = buffered.indexOf('\n');
    if (newline < 0) break;
    const line = buffered.slice(0, newline).replace(/\r$/, '');
    buffered = buffered.slice(newline + 1);
    if (!line) continue;
    const message = JSON.parse(line);
    if (message.method === 'initialize') {
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          protocolVersion: message.params?.protocolVersion ?? '2025-11-25',
          capabilities: { tools: {} },
          serverInfo: { name: 'workflow-next-tp02a', version: '1.0.0' },
        },
      });
    } else if (message.method === 'ping') {
      send({ jsonrpc: '2.0', id: message.id, result: {} });
    } else if (message.method === 'tools/list') {
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          tools: [
            {
              name: TOOL_NAME,
              description:
                'Probe persistent PLUGIN_DATA file and SQLite storage.',
              inputSchema: {
                type: 'object',
                additionalProperties: false,
                required: ['mode', 'nonce'],
                properties: {
                  mode: { enum: ['write', 'verify', 'cleanup'] },
                  nonce: { type: 'string', minLength: 1, maxLength: 160 },
                },
              },
            },
          ],
        },
      });
    } else if (message.method === 'tools/call') {
      try {
        if (message.params?.name !== TOOL_NAME) throw new Error('unknown tool');
        result(message.id, execute(message.params.arguments));
      } catch (error) {
        const value = {
          pluginDataPresent: Boolean(process.env.PLUGIN_DATA),
          error: String(error.message ?? error),
        };
        send({
          jsonrpc: '2.0',
          id: message.id,
          result: {
            isError: true,
            structuredContent: value,
            content: [{ type: 'text', text: JSON.stringify(value) }],
          },
        });
      }
    } else if (message.id !== undefined) {
      send({
        jsonrpc: '2.0',
        id: message.id,
        error: { code: -32601, message: 'Method not found' },
      });
    }
  }
});
