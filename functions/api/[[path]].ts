import { handle } from '../../server/app';

export const onRequest = (ctx: { request: Request; env: Record<string, string | undefined>; waitUntil: (p: Promise<unknown>) => void }) =>
  handle(ctx.request, { NODE_ENV: 'production', ...ctx.env }, (p) => ctx.waitUntil(p));
