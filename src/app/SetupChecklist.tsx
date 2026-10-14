import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckIcon, PlayIcon } from '../components/ui/Icons';
import { useToast } from '../components/ui/Toast';
import { embedUrl, VideoDialog } from '../components/ui/VideoDialog';
import { VIDEOS } from '../config/product';
import { SETUP_STEPS, setupProgress } from '../domain/setup';
import { SITE_ORIGIN } from '../lib/native';
import type { SetupStep } from '../domain/types';
import { useI18n } from '../i18n/I18nProvider';
import { useWorkspace } from './workspace';

/** Getting started, on the Today screen: what's left to do, each step with its own short video. */
export function SetupChecklist() {
  const { tenant, api, can } = useWorkspace();
  const { t } = useI18n();
  const toast = useToast();
  const [video, setVideo] = useState<{ url: string; title: string } | null>(null);
  const b = tenant.business;
  if (!can('business.settings') || b.setup?.dismissed) return null;

  const progress = setupProgress(tenant);
  const doneCount = SETUP_STEPS.filter((s) => progress[s]).length;
  const next = SETUP_STEPS.find((s) => !progress[s]);
  const pageUrl = `${SITE_ORIGIN}/book/${b.slug}`;

  const save = (setup: NonNullable<typeof b.setup>) => api.updateBusiness({ setup }).catch(() => toast(t('common.unknownError')));
  const tick = (s: SetupStep) => save({ done: [...new Set([...(b.setup?.done ?? []), s])], dismissed: b.setup?.dismissed });
  const hide = () => save({ done: b.setup?.done ?? [], dismissed: true });
  const play = (key: string, title: string) => {
    const url = VIDEOS[key];
    if (!url) return;
    if (embedUrl(url)) setVideo({ url, title });
    else window.open(url, '_blank', 'noopener');
  };

  const action = (s: SetupStep) => {
    switch (s) {
      case 'page':
      case 'photos':
        return (
          <Link to="/app/page" className="btn btn--sm btn--tinted">
            {t(`setup.steps.${s}.cta`)}
          </Link>
        );
      case 'team':
        return (
          <>
            <Link to="/app/staff" className="btn btn--sm btn--tinted">
              {t('setup.steps.team.cta')}
            </Link>
            <button type="button" className="btn btn--sm btn--quiet" onClick={() => tick('team')}>
              {t('setup.steps.team.solo')}
            </button>
          </>
        );
      case 'publish':
        return (
          <button
            type="button"
            className="btn btn--sm btn--primary"
            onClick={async () => {
              await api.setPublished(true);
              toast(t('app.published'));
            }}
          >
            {t('setup.steps.publish.cta')}
          </button>
        );
      case 'calendar':
        return (
          <Link to="/app/settings/calendar" className="btn btn--sm btn--tinted">
            {t('setup.steps.calendar.cta')}
          </Link>
        );
      case 'share':
        return (
          <button
            type="button"
            className="btn btn--sm btn--tinted"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(pageUrl);
                toast(t('setup.steps.share.copied'));
              } catch {
                /* clipboard blocked: the step still counts once they've seen the link */
              }
              void tick('share');
            }}
          >
            {t('setup.steps.share.cta')}
          </button>
        );
      case 'firstBooking':
        return (
          <a href={`/book/${b.slug}`} target="_blank" rel="noreferrer" className="btn btn--sm btn--tinted">
            {t('setup.steps.firstBooking.cta')}
          </a>
        );
    }
  };

  return (
    <section className="panel setup" aria-labelledby="setup-title">
      <div className="setup__head">
        <div>
          <h2 className="setup__title" id="setup-title">
            {next ? t('setup.title') : t('setup.doneTitle')}
          </h2>
          <p className="setup__lede">{next ? t('setup.lede', { done: doneCount, total: SETUP_STEPS.length }) : t('setup.doneBody')}</p>
        </div>
        <div className="setup__tools">
          {VIDEOS.welcome && (
            <button type="button" className="btn btn--sm btn--quiet" onClick={() => play('welcome', t('setup.welcomeVideo'))}>
              <PlayIcon size={12} /> {t('setup.welcomeVideo')}
            </button>
          )}
          <button type="button" className="btn btn--sm btn--quiet" onClick={hide}>
            {t('setup.hide')}
          </button>
        </div>
      </div>
      <div className="setup__bar" role="progressbar" aria-valuemin={0} aria-valuemax={SETUP_STEPS.length} aria-valuenow={doneCount} aria-label={t('setup.title')}>
        <span style={{ width: `${(doneCount / SETUP_STEPS.length) * 100}%` }} />
      </div>
      <ol className="setup__list">
        {SETUP_STEPS.map((s) => {
          const done = progress[s];
          const title = t(`setup.steps.${s}.title`);
          return (
            <li key={s} className="setup__step" data-done={done || undefined} data-next={s === next || undefined}>
              <span className="setup__check" aria-hidden>
                {done && <CheckIcon size={12} />}
              </span>
              <div className="setup__text">
                <span className="setup__name">
                  {title}
                  {done && <span className="sr-only"> · {t('setup.done')}</span>}
                </span>
                {!done && <span className="setup__body">{t(`setup.steps.${s}.body`)}</span>}
              </div>
              {!done && (
                <div className="setup__actions">
                  {VIDEOS[s] && (
                    <button type="button" className="btn btn--sm btn--quiet" onClick={() => play(s, title)} aria-label={t('setup.watch', { step: title })}>
                      <PlayIcon size={12} /> {t('setup.video')}
                    </button>
                  )}
                  {action(s)}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <VideoDialog url={video?.url ?? null} title={video?.title ?? ''} closeLabel={t('common.close')} onClose={() => setVideo(null)} />
    </section>
  );
}
