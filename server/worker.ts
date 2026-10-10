import { handle } from './app';

/** Cloudflare entry: /api/* runs here (see run_worker_first in wrangler.jsonc); everything else is the built site. */
export default {
  fetch: (req: Request, env: Record<string, string | undefined>) => handle(req, { NODE_ENV: 'production', ...env }),
};
