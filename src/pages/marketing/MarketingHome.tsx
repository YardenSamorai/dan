import { Link } from 'react-router-dom';
import { HeroCalendar } from '../../components/hero/HeroCalendar';
import { ArrowIcon } from '../../components/ui/Icons';
import { useI18n } from '../../i18n/I18nProvider';
import { CAPABILITIES } from '../../config/product';
import { BusinessTypes } from './BusinessTypes';
import { HowItWorks } from './HowItWorks';
import { Switching } from './MoreVignettes';
import { Showcase } from './Showcase';

/** What the page owns up to, straight from the build's capabilities. */
const missing = (
  [
    ['messaging', CAPABILITIES.messaging],
    ['payments', CAPABILITIES.payments],
    ['local', CAPABILITIES.backend],
  ] as const
)
  .filter(([, has]) => !has)
  .map(([key]) => key);

export default function MarketingHome() {
  const { t } = useI18n();
  return (
    <>
      <HeroCalendar />

      <section className="section container mk-bridge" id="features" aria-labelledby="features-title">
        <div className="section-head">
          <p className="eyebrow">{t('marketing.features.eyebrow')}</p>
          <h2 id="features-title" className="display display-md">
            {t('marketing.features.title')}
          </h2>
        </div>
        <Showcase />
        <div className="mk-demo">
          <Link to="/book/demo-studio" className="link-arrow">
            {t('marketing.cta.demo')} <ArrowIcon />
          </Link>
          <Link to="/sign-in" className="link-arrow">
            {t('marketing.cta.workspace')} <ArrowIcon />
          </Link>
        </div>
      </section>

      <HowItWorks />

      <BusinessTypes />

      <Switching />

      {missing.length > 0 && (
        <section className="section container" aria-labelledby="honest-title">
          <div className="mk-honest">
            <p className="eyebrow">{t('marketing.honest.eyebrow')}</p>
            <h2 id="honest-title" className="display display-sm">
              {t('marketing.honest.title')}
            </h2>
            <ul>
              {missing.map((m) => (
                <li key={m}>{t(`marketing.honest.${m}`)}</li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="section final">
        <div className="container">
          <h2 className="display">{t('marketing.final.title')}</h2>
          <p>{t('marketing.final.body')}</p>
          <Link to="/sign-up" className="btn btn--light btn--lg">
            {t('marketing.cta.primary')}
          </Link>
        </div>
      </section>
    </>
  );
}
