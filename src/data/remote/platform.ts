import { useSyncExternalStore } from 'react';
import type { PlatformInfo, PlatformService } from '../contracts';
import { Resource, rpc } from './client';

const info = new Resource<PlatformInfo>(() => rpc<PlatformInfo>('platform.info'));

export const remotePlatform: PlatformService = {
  useInfo: () => useSyncExternalStore(info.subscribe, () => info.read('') ?? null),
};
