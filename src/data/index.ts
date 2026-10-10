import type { AuthService, BusinessDirectory, PublicBookingApi, WorkspaceData } from './contracts';
import { mockAuth, mockDirectory } from './mock/auth';
import { mockPublicBooking } from './mock/public';
import { mockWorkspace } from './mock/workspace';

/**
 * The single swap point between mock adapters and a real backend. UI code
 * imports from here (and ./contracts), never from ./mock directly.
 */
export const auth: AuthService = mockAuth;
export const directory: BusinessDirectory = mockDirectory;
export const publicBooking: PublicBookingApi = mockPublicBooking;
export const workspace: WorkspaceData = mockWorkspace;

export * from './contracts';
