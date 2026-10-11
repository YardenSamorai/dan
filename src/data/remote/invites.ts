import type { InvitePreview, InviteService } from '../contracts';
import { refreshSession, remoteAuth } from './auth';
import { rpc } from './client';

export const remoteInvites: InviteService = {
  peek: (slug, token) => rpc<InvitePreview | null>('invite.peek', slug, token),

  async accept(slug, token) {
    const businessId = await rpc<string>('invite.accept', slug, token);
    await refreshSession();
    await remoteAuth.switchBusiness(businessId);
    return businessId;
  },
};
