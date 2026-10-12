import type { IncomingMessage } from 'node:http';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const MAX_BODY = 10 * 1024 * 1024;

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('too_large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** Serves /api/* from server/app.ts during `vite dev`, reloaded on change like the rest of the app. */
function api(env: Record<string, string>): Plugin {
  return {
    name: 'local-api',
    configureServer(server) {
      server.middlewares.use('/api/', async (req, res) => {
        try {
          const body = req.method === 'POST' ? new Uint8Array(await readBody(req)) : undefined;
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
          const request = new Request(`http://localhost${req.originalUrl ?? '/api/rpc'}`, { method: req.method, headers, body });
          const { handle } = (await server.ssrLoadModule('/server/app.ts')) as typeof import('./server/app');
          const response = await handle(request, { ...process.env, ...env });
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (e) {
          if (!(e instanceof Error && e.message === 'too_large')) console.error('[api]', e instanceof Error ? e.message : e);
          res.statusCode = e instanceof Error && e.message === 'too_large' ? 413 : 500;
          res.end(JSON.stringify({ error: res.statusCode === 413 ? 'too_large' : 'server' }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), api(env)],
    server: {
      allowedHosts: ['.trycloudflare.com'],
    },
  };
});
