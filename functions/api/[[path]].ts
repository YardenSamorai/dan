import { handle } from '../../server/app';

/** Cloudflare Pages: every /api/* request goes to the shared server handler; the rest is the static site. */
export const onRequest = (ctx: { request: Request; env: Record<string, string | undefined> }) =>
  handle(ctx.request, { NODE_ENV: 'production', ...ctx.env });
