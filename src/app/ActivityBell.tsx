import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BellIcon } from '../components/ui/Icons';
import { useToast } from '../components/ui/Toast';
import { storageKey } from '../config/product';
import { platform } from '../data';
import { customerActivity, type Activity } from '../domain/activity';
import type { TenantData } from '../domain/types';
import { localeMeta } from '../i18n/config';
import { useI18n } from '../i18n/I18nProvider';
import { isNativeApp } from '../lib/native';
import { addAppManifest, disablePush, enablePush, existingDevice, onNotificationOpen, pushState, type PushState } from '../lib/push';
import { useAppUI } from './AppUI';
import { usePopover } from './usePopover';
import { useWorkspace } from './workspace';

function useActivityText() {
  const { t, tx, fmt } = useI18n();
  return (tenant: TenantData, x: Activity) => {
    const a = x.appointment;
    const name = tenant.customers.find((c) => c.id === a.customerId)?.name ?? '';
    const service = tx(tenant.services.find((s) => s.id === a.serviceId)?.name);
    return {
      kind: t(`activity.kinds.${x.kind}`),
      name,
      line: t('activity.line', { service, date: fmt.date(a.date, 'medium'), time: fmt.time(a.start) }),
    };
  };
}

function useAgo() {
  const { locale } = useI18n();
  const rtf = useMemo(() => new Intl.RelativeTimeFormat(localeMeta[locale].intl, { numeric: 'auto' }), [locale]);
  // Chrome's Hebrew data repeats the count after singular and dual forms: "לפני שעתיים (2)".
  const say = (n: number, unit: Intl.RelativeTimeFormatUnit) => rtf.format(n, unit).replace(/\s\(\d+\)$/, '');
  return (iso: string) => {
    const min = Math.round((Date.parse(iso) - Date.now()) / 60_000);
    if (min > -60) return say(Math.min(min, -1), 'minute');
    if (min > -24 * 60) return say(Math.round(min / 60), 'hour');
    return say(Math.round(min / 1440), 'day');
  };
}

/**
 * Turning push notifications on and off for this browser. Shows nothing when
 * the server has no push keys, so the app never offers what can't be sent.
 */
export function PushControl() {
  const { t } = useI18n();
  const { api } = useWorkspace();
  const toast = useToast();
  const info = platform.useInfo();
  const key = info?.pushKey;
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!key) return;
    let live = true;
    void pushState().then((s) => live && setState(s));
    return () => {
      live = false;
    };
  }, [key]);

  // The iPhone app's web view has no web push; it needs Apple's own notifications.
  if (!key || !state || isNativeApp) return null;

  const turnOn = async () => {
    setBusy(true);
    try {
      const device = await enablePush(key);
      if (!device) {
        setState(await pushState());
        return;
      }
      await api.savePushDevice(device);
      setState('on');
      toast(t('activity.push.turnedOn'));
    } catch {
      toast(t('activity.push.failed'));
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    try {
      const endpoint = await disablePush();
      if (endpoint) await api.removePushDevice(endpoint).catch(() => {});
      setState('off');
      toast(t('activity.push.turnedOff'));
    } finally {
      setBusy(false);
    }
  };

  if (state === 'on') {
    return (
      <div className="push-control">
        <p className="push-control__title">{t('activity.push.onTitle')}</p>
        <button type="button" className="btn btn--tinted btn--xs" onClick={turnOff} disabled={busy}>
          {t('activity.push.turnOff')}
        </button>
      </div>
    );
  }
  if (state === 'off') {
    return (
      <div className="push-control push-control--off">
        <div>
          <p className="push-control__title">{t('activity.push.offTitle')}</p>
          <p className="push-control__body">{t('activity.push.offBody')}</p>
        </div>
        <button type="button" className="btn btn--primary btn--xs" onClick={turnOn} disabled={busy}>
          {t('activity.push.turnOn')}
        </button>
      </div>
    );
  }
  return <p className="push-control push-control__body">{t(`activity.push.${state}`)}</p>;
}

/** Keeps the server's copy of this browser's subscription current, once per visit (it can renew, or another person may have signed in here). */
function usePushSync() {
  const { api, ctx } = useWorkspace();
  const key = platform.useInfo()?.pushKey;
  useEffect(() => {
    if (!key) return;
    const flag = storageKey(`push.synced.${ctx.businessId}.${ctx.userId}`);
    if (sessionStorage.getItem(flag)) return;
    void existingDevice(key)
      .then((d) => d && api.savePushDevice(d))
      .then(() => sessionStorage.setItem(flag, '1'))
      .catch(() => {});
  }, [key, api, ctx.businessId, ctx.userId]);
}

/** Opens `/app?appointment=…` links (from notifications) on the appointment itself. */
function useAppointmentLinks() {
  const { openAppointment } = useAppUI();
  const { search, pathname } = useLocation();
  const navigate = useNavigate();
  useEffect(() => onNotificationOpen((url) => navigate(new URL(url).pathname + new URL(url).search)), [navigate]);
  useEffect(() => {
    const id = new URLSearchParams(search).get('appointment');
    if (!id) return;
    openAppointment(id);
    navigate(pathname, { replace: true });
  }, [search, pathname, navigate, openAppointment]);
}

/** The bell in the top bar: what customers did online, with what's new since this person last looked. */
export function ActivityBell() {
  const { t } = useI18n();
  const { tenant, ctx } = useWorkspace();
  const { openAppointment } = useAppUI();
  const toast = useToast();
  const text = useActivityText();
  const ago = useAgo();
  const { open, setOpen, ref } = usePopover();
  const id = useId();
  // A minute of slack: the server that stamps the events may run a little ahead of this device's clock.
  const items = useMemo(() => customerActivity(tenant, new Date(Date.now() + 60_000)), [tenant]);

  useEffect(() => addAppManifest(), []);
  usePushSync();
  useAppointmentLinks();

  const seenKey = storageKey(`activity.seen.${ctx.businessId}.${ctx.userId}`);
  const [seen, setSeen] = useState(() => localStorage.getItem(seenKey));
  // The first time, everything that already happened counts as seen.
  useEffect(() => {
    if (seen !== null) return;
    const now = new Date().toISOString();
    localStorage.setItem(seenKey, now);
    setSeen(now);
  }, [seen, seenKey]);
  const unread = seen ? items.filter((x) => x.at > seen).length : 0;
  /** Rows that were new when the panel opened stay marked while it's open. */
  const [newSince, setNewSince] = useState<string | null>(null);

  // Something happens while the app is open: say so (the workspace refreshes in the background).
  const latest = useRef(items[0]?.at ?? '');
  useEffect(() => {
    const fresh = items.filter((x) => x.at > latest.current);
    if (items[0]) latest.current = items[0].at > latest.current ? items[0].at : latest.current;
    const x = fresh[0];
    if (!x || open) return;
    const s = text(tenant, x);
    toast(t('activity.toast', { kind: s.kind, name: s.name }), { label: t('activity.view'), run: () => openAppointment(x.appointment.id) });
  }, [items]);

  const toggle = () => {
    if (!open) {
      setNewSince(seen);
      const now = new Date().toISOString();
      localStorage.setItem(seenKey, now);
      setSeen(now);
    }
    setOpen((o) => !o);
  };

  return (
    <div className="activity" ref={ref}>
      <button
        type="button"
        className="icon-btn activity__btn"
        aria-expanded={open}
        aria-controls={id}
        aria-label={unread ? t('activity.unread', { count: unread }) : t('activity.open')}
        onClick={toggle}
      >
        <BellIcon size={18} />
        {unread > 0 && <span className="activity__badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="popover popover--end activity__panel" id={id}>
          <div className="activity__head">
            <p className="activity__title">{t('activity.title')}</p>
            <p className="activity__lede">{t('activity.lede')}</p>
          </div>
          {items.length === 0 ? (
            <p className="activity__empty">{t('activity.empty')}</p>
          ) : (
            <ul className="activity__list" role="list">
              {items.map((x) => {
                const s = text(tenant, x);
                return (
                  <li key={x.id}>
                    <button
                      type="button"
                      className="menu-row activity__row"
                      data-kind={x.kind}
                      data-new={(newSince && x.at > newSince) || undefined}
                      onClick={() => {
                        setOpen(false);
                        openAppointment(x.appointment.id);
                      }}
                    >
                      <span className="activity__dot" aria-hidden />
                      <span className="menu-row__text">
                        <span className="menu-row__title">
                          {s.kind} · {s.name}
                        </span>
                        <span className="menu-row__sub">{s.line}</span>
                      </span>
                      <span className="activity__ago">{ago(x.at)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="popover__sep" />
          <PushControl />
        </div>
      )}
    </div>
  );
}
