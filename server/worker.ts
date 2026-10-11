import { handle } from './app';

type Env = Record<string, string | undefined>;
interface Ctx {
  waitUntil(p: Promise<unknown>): void;
}

/** Cloudflare entry: /api/* runs here (see run_worker_first in wrangler.jsonc); everything else is the built site. */
export default {
  fetch: (req: Request, env: Env, ctx: Ctx) => handle(req, { NODE_ENV: 'production', ...env }, (p) => ctx.waitUntil(p)),
};
