import { useSyncExternalStore } from 'react';
import type { PlatformInfo, PlatformService } from '../contracts';
import { Resource, rpc } from './client';

const info = new Resource<PlatformInfo>(() => rpc<PlatformInfo>('platform.info'));

// The iPhone app can stay open for days; what the server offers may change meanwhile.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && info.has('')) void info.refresh('');
  });
}

export const remotePlatform: PlatformService = {
  useInfo: () => useSyncExternalStore(info.subscribe, () => info.read('') ?? null),
};
