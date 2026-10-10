import type { AuthService, BusinessDirectory, PublicBookingApi, WorkspaceData } from './contracts';
import { mockAuth, mockDirectory } from './mock/auth';
import { mockPublicBooking } from './mock/public';
import { mockWorkspace } from './mock/workspace';
import { remoteAuth, remoteDirectory } from './remote/auth';
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

export * from './contracts';
