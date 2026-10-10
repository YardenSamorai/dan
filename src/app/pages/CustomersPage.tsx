import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PlusIcon, SearchIcon, UploadIcon } from '../../components/ui/Icons';
import { Avatar } from '../../components/ui/bits';
import { localeMeta } from '../../i18n/config';
import { useI18n } from '../../i18n/I18nProvider';
import { useAppUI } from '../AppUI';
import { customerStats } from '../drawers/CustomerDrawer';
import { useLookup } from '../lookup';
import { PageHeader } from '../shared';
import { useWorkspace } from '../workspace';

export default function CustomersPage() {
  const L = useLookup();
  const { t, fmt, locale } = useI18n();
  const { openCustomer, newCustomer } = useAppUI();
  const { can } = useWorkspace();
  const [q, setQ] = useState('');

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    const digits = query.replace(/\D/g, '');
    return L.state.customers
      .filter((c) => !query || c.name.toLowerCase().includes(query) || (digits.length > 2 && c.phone.replace(/\D/g, '').includes(digits)))
      .map((c) => ({ c, s: customerStats(L.state, c.id) }))
      .sort((a, b) => a.c.name.localeCompare(b.c.name, localeMeta[locale].intl));
  }, [L, q, locale]);

  return (
    <div className="page">
      <PageHeader title={t('app.nav.customers')} />
      <div className="toolbar">
        <label className="search">
          <SearchIcon />
          <input
            className="field__input field__input--sm"
            type="search"
            placeholder={t('customers.searchPlaceholder')}
            aria-label={t('customers.searchPlaceholder')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <span className="toolbar__spacer" />
        <span className="toolbar__count">{t('customers.count', { count: rows.length })}</span>
        {can('customers.edit') && (
          <>
            <Link to="/app/customers/import" className="btn btn--ghost btn--sm">
              <UploadIcon /> {t('customers.import.button')}
            </Link>
            <button type="button" className="btn btn--ghost btn--sm" onClick={newCustomer}>
              <PlusIcon /> {t('customers.add')}
            </button>
          </>
        )}
      </div>

      <section className="panel">
        {rows.length === 0 ? (
          <p className="empty">{L.state.customers.length ? t('customers.empty') : t('customers.emptyAll')}</p>
        ) : (
          <>
            <div className="table-wrap only-desktop">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">{t('customers.col.name')}</th>
                    <th scope="col">{t('customers.col.phone')}</th>
                    <th scope="col" className="num">
                      {t('customers.col.visits')}
                    </th>
                    <th scope="col" className="num">
                      {t('customers.stats.noShows')}
                    </th>
                    <th scope="col">{t('customers.col.last')}</th>
                    <th scope="col">{t('customers.col.next')}</th>
                    <th scope="col" className="num">
                      {t('customers.col.spend')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ c, s }) => (
                    <tr key={c.id} onClick={() => openCustomer(c.id)}>
                      <td>
                        <span className="cell-person">
                          <Avatar name={c.name} size="sm" />
                          <button type="button" className="row-btn table__primary" onClick={(e) => (e.stopPropagation(), openCustomer(c.id))}>
                            {c.name}
                          </button>
                          <span className="badge badge--plain">{localeMeta[c.locale].short}</span>
                          {c.blocked && <span className="badge badge--danger">{t('customers.block.badge')}</span>}
                        </span>
                      </td>
                      <td>
                        <span className="ltr">{c.phone}</span>
                      </td>
                      <td className="num">{fmt.number(s.visits)}</td>
                      <td className="num" data-warn={s.noShows > 0 || undefined}>
                        {s.noShows ? fmt.number(s.noShows) : t('customers.never')}
                      </td>
                      <td>{s.last ? fmt.date(s.last, 'short') : t('customers.never')}</td>
                      <td>{s.next ? `${fmt.date(s.next.date, 'short')} · ${fmt.time(s.next.start)}` : t('customers.never')}</td>
                      <td className="num">{fmt.money(s.spend)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="list only-mobile">
              {rows.map(({ c, s }) => (
                <button key={c.id} type="button" className="list__row" onClick={() => openCustomer(c.id)}>
                  <Avatar name={c.name} size="sm" />
                  <div className="list__main">
                    <span className="list__title">
                      {c.name} {c.blocked && <span className="badge badge--danger">{t('customers.block.badge')}</span>}
                    </span>
                    <span className="list__sub">
                      <span className="ltr">{c.phone}</span> · {t('units.visits', { count: s.visits })}
                    </span>
                  </div>
                  {s.next && <span className="muted">{fmt.date(s.next.date, 'short')}</span>}
                </button>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
