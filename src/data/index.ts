import type { AuthService, BusinessDirectory, InviteService, PlatformInfo, PlatformService, PublicBookingApi, WorkspaceData } from './contracts';
import { mockAuth, mockDirectory } from './mock/auth';
import { mockInvites } from './mock/invites';
import { mockPublicBooking } from './mock/public';
import { mockWorkspace } from './mock/workspace';
import { remoteAuth, remoteDirectory } from './remote/auth';
import { remoteInvites } from './remote/invites';
import { remotePlatform } from './remote/platform';
import { remotePublicBooking } from './remote/public';
import { remoteWorkspace } from './remote/workspace';

/**
 * The single swap point between the in-browser demo and the real backend.
 * UI code imports from here (and ./contracts), never from ./mock or ./remote.
 * VITE_BACKEND=mock keeps everything in this browser's localStorage.
 */
const remote = import.meta.env.VITE_BACKEND !== 'mock';

export const auth: AuthService = remote ? remoteAuth : mockAuth;
export const directory: BusinessDirectory = remote ? remoteDirectory : mockDirectory;
export const publicBooking: PublicBookingApi = remote ? remotePublicBooking : mockPublicBooking;
export const workspace: WorkspaceData = remote ? remoteWorkspace : mockWorkspace;
export const invites: InviteService = remote ? remoteInvites : mockInvites;
/** The in-browser demo never delivers anything; its booking lookup shows the code on screen instead. */
const NOTHING_CONNECTED: PlatformInfo = { channels: [], phoneCodes: true };
export const platform: PlatformService = remote ? remotePlatform : { useInfo: () => NOTHING_CONNECTED };

export * from './contracts';
