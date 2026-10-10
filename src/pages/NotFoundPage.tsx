import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider';
import '../styles/public.css';

export default function NotFoundPage() {
  const { t } = useI18n();
  return (
    <section className="page-head container" style={{ minHeight: '70vh' }}>
      <h1 className="display">{t('notFound.title')}</h1>
      <p className="lede">{t('notFound.body')}</p>
      <Link to="/" className="btn btn--ink" style={{ marginBlockStart: 32 }}>
        {t('notFound.home')}
      </Link>
    </section>
  );
}
