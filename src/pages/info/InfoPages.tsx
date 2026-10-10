import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, PlayIcon } from '../../components/ui/Icons';
import { embedUrl, VideoDialog } from '../../components/ui/VideoDialog';
import { OPERATOR, PRODUCT, VIDEOS } from '../../config/product';
import { useI18n } from '../../i18n/I18nProvider';
import { HELP, LEGAL, type DocKey } from './content';
import './info.css';

function useFill() {
  const { fmt } = useI18n();
  const vars: Record<string, string> = {
    product: PRODUCT.name,
    company: OPERATOR.company,
    companyId: OPERATOR.companyId,
    address: OPERATOR.address,
    email: OPERATOR.email,
    a11yContact: OPERATOR.a11yContact,
    updated: fmt.date(OPERATOR.legalUpdated, 'numeric'),
  };
  return (s: string) => s.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
}

/** Paragraph text with the support address turned into a mailto link. */
function Para({ text }: { text: string }) {
  const parts = text.split(OPERATOR.email);
  return (
    <p>
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 && (
            <a href={`mailto:${OPERATOR.email}`} className="ltr">
              {OPERATOR.email}
            </a>
          )}
          {part}
        </span>
      ))}
    </p>
  );
}

function useTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · ${PRODUCT.name}`;
  }, [title]);
}

export function LegalPage({ doc }: { doc: DocKey }) {
  const { locale, t } = useI18n();
  const fill = useFill();
  const d = LEGAL[doc][locale];
  useTitle(d.title);
  return (
    <article className="info container">
      <header className="info__head">
        <h1 className="info__title">{d.title}</h1>
        {d.intro && <p className="info__lede">{fill(d.intro)}</p>}
      </header>
      {d.sections.map((s, i) => (
        <section key={i} className="info__section">
          <h2>{s.h}</h2>
          {s.p.map((p, j) => (
            <Para key={j} text={fill(p)} />
          ))}
        </section>
      ))}
      <nav className="info__related" aria-label={t('legal.related')}>
        {(['privacy', 'terms', 'accessibility'] as const)
          .filter((k) => k !== doc)
          .map((k) => (
            <Link key={k} to={`/${k}`}>
              {LEGAL[k][locale].title}
            </Link>
          ))}
        <Link to="/help">{HELP[locale].title}</Link>
      </nav>
    </article>
  );
}

export function HelpPage() {
  const { locale, t } = useI18n();
  const fill = useFill();
  const h = HELP[locale];
  const [video, setVideo] = useState<{ url: string; title: string } | null>(null);
  useTitle(h.title);
  const play = (key: string, title: string) => {
    const url = VIDEOS[key];
    if (!url) return;
    if (embedUrl(url)) setVideo({ url, title });
    else window.open(url, '_blank', 'noopener');
  };
  return (
    <article className="info container">
      <header className="info__head">
        <h1 className="info__title">{h.title}</h1>
        <p className="info__lede">{h.lede}</p>
      </header>
      {h.groups.map((g) => (
        <section key={g.title} className="info__section">
          <h2>{g.title}</h2>
          <div className="faq">
            {g.items.map((item) => (
              <details key={item.q} className="faq__item">
                <summary>
                  <span>{item.q}</span>
                  <ChevronDown size={16} className="faq__chev" />
                </summary>
                <div className="faq__answer">
                  {item.a.map((p, i) => (
                    <Para key={i} text={fill(p)} />
                  ))}
                  {item.video && VIDEOS[item.video] && (
                    <button type="button" className="btn btn--sm btn--tinted" onClick={() => play(item.video!, item.q)}>
                      <PlayIcon size={12} /> {t('setup.video')}
                    </button>
                  )}
                </div>
              </details>
            ))}
          </div>
        </section>
      ))}
      <div className="info__contact">
        <Para text={fill(h.contact)} />
      </div>
      <nav className="info__related" aria-label={t('legal.related')}>
        {(['privacy', 'terms', 'accessibility'] as const).map((k) => (
          <Link key={k} to={`/${k}`}>
            {LEGAL[k][locale].title}
          </Link>
        ))}
      </nav>
      <VideoDialog url={video?.url ?? null} title={video?.title ?? ''} closeLabel={t('common.close')} onClose={() => setVideo(null)} />
    </article>
  );
}

export const PrivacyPage = () => <LegalPage doc="privacy" />;
export const TermsPage = () => <LegalPage doc="terms" />;
export const AccessibilityPage = () => <LegalPage doc="accessibility" />;
export default HelpPage;
