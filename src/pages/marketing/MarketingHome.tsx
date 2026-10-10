import { Link } from 'react-router-dom';
import { HeroCalendar } from '../../components/hero/HeroCalendar';
import { ArrowIcon } from '../../components/ui/Icons';
import { BUSINESS_TYPES } from '../../domain/defaults';
import { useI18n } from '../../i18n/I18nProvider';
import { Showcase } from './Showcase';

const STEPS = ['setup', 'share', 'manage'] as const;

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

      <section className="section how" id="how" aria-labelledby="how-title">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow">{t('marketing.how.eyebrow')}</p>
            <h2 id="how-title" className="display display-md">
              {t('marketing.how.title')}
            </h2>
          </div>
          <ol className="how__steps">
            {STEPS.map((s) => (
              <li key={s} className="how__step">
                <h3>{t(`marketing.how.steps.${s}.title`)}</h3>
                <p>{t(`marketing.how.steps.${s}.body`)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section container" aria-labelledby="types-title">
        <div className="section-head">
          <p className="eyebrow">{t('marketing.types.eyebrow')}</p>
          <h2 id="types-title" className="display display-md">
            {t('marketing.types.title')}
          </h2>
          <p className="muted">{t('marketing.types.solo')}</p>
        </div>
        <ul className="mk-types">
          {BUSINESS_TYPES.filter((x) => x !== 'other').map((type) => (
            <li key={type}>{t(`businessType.${type}`)}</li>
          ))}
        </ul>
      </section>

      <section className="section container" aria-labelledby="honest-title">
        <div className="mk-honest">
          <p className="eyebrow">{t('marketing.honest.eyebrow')}</p>
          <h2 id="honest-title" className="display display-sm">
            {t('marketing.honest.title')}
          </h2>
          <p>{t('marketing.honest.body')}</p>
        </div>
      </section>

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
