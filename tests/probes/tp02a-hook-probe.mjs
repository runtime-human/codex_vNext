import fs from 'node:fs';
import path from 'node:path';

try {
  if (!process.env.PLUGIN_ROOT) throw new Error('PLUGIN_ROOT is not set');
  if (!process.env.PLUGIN_DATA) throw new Error('PLUGIN_DATA is not set');
  const root = path.resolve(process.env.PLUGIN_DATA);
  const target = path.resolve(root, 'tp02a-hook-probe.log');
  if (target !== path.join(root, 'tp02a-hook-probe.log'))
    throw new Error('hook path escaped PLUGIN_DATA');
  fs.mkdirSync(root, { recursive: true });
  fs.appendFileSync(target, `${process.env.TP02A_NONCE ?? 'hook'}\n`);
  process.stdout.write(
    `${JSON.stringify({ pluginRootPresent: true, pluginDataPresent: true, write: 'pass' })}\n`,
  );
} catch (error) {
  process.stdout.write(
    `${JSON.stringify({
      pluginRootPresent: Boolean(process.env.PLUGIN_ROOT),
      pluginDataPresent: Boolean(process.env.PLUGIN_DATA),
      write: 'fail',
      error: String(error.message ?? error),
    })}\n`,
  );
  process.exitCode = 1;
}
