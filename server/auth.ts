import { createHmac, timingSafeEqual } from 'node:crypto';
import type { User } from '../src/domain/platform';

/** Turns a request's bearer token into the signed-in user's id, or null. */
export interface Authenticator {
  /** Email-only sign-in for local development; never enabled with a real identity provider. */
  readonly devSignIn: boolean;
  userId(token: string | null): Promise<string | null>;
  issue?(userId: string): string;
  /** With a real identity provider: who the token belongs to, so a profile can be created on first sign-in. */
  profile?(token: string | null): Promise<Pick<User, 'id' | 'email' | 'name' | 'locale'> | null>;
  /** With a real identity provider: a new email + password account, usable at once. */
  createAccount?(input: { email: string; password: string; name: string; locale: User['locale'] }): Promise<void>;
}

const sign = (secret: string, userId: string) => createHmac('sha256', secret).update(userId).digest('base64url');

/** Development: `dev.<userId>.<hmac>`. Anyone who can read the secret can sign in as anyone. */
export function devAuthenticator(secret: string): Authenticator {
  return {
    devSignIn: true,
    async userId(token) {
      const [kind, userId, sig] = token?.split('.') ?? [];
      if (kind !== 'dev' || !userId || !sig) return null;
      const want = Buffer.from(sign(secret, userId));
      const got = Buffer.from(sig);
      return want.length === got.length && timingSafeEqual(want, got) ? userId : null;
    },
    issue: (userId) => `dev.${userId}.${sign(secret, userId)}`,
  };
}

export const bearer = (req: Request) => req.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1] ?? null;
