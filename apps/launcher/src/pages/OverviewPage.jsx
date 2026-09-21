import { useEffect, useState } from 'react';
import { cleanErrorMessage } from '../lib/cleanError.js';

function AthleteDetail({ athlete }) {
  return (
    <div className="detail-block">
      <div>
        <strong>Club:</strong> {athlete.club?.name || 'Fără club'}
        {athlete.club?.city?.name ? ` (${athlete.club.city.name})` : ''}
      </div>
      {athlete.current_grade?.name && (
        <div>
          <strong>Grad:</strong> {athlete.current_grade.name}
        </div>
      )}
      <div>
        <strong>Rol:</strong>{' '}
        {[athlete.is_coach && 'antrenor', athlete.is_referee && 'arbitru'].filter(Boolean).join(', ') || 'sportiv'}
      </div>
    </div>
  );
}

function ClubDetail({ club }) {
  const coaches = club.coaches || [];
  return (
    <div className="detail-block">
      {club.address && (
        <div>
          <strong>Adresă:</strong> {club.address}
        </div>
      )}
      {club.mobile_number && (
        <div>
          <strong>Telefon:</strong> {club.mobile_number}
        </div>
      )}
      {coaches.length > 0 && (
        <div>
          <strong>Antrenori:</strong> {coaches.map((c) => c.full_name || `${c.first_name} ${c.last_name}`).join(', ')}
        </div>
      )}
    </div>
  );
}

// Shown right after cloud login - answers "what's actually in the cloud
// database" before the operator commits to syncing an event. The two
// counts are always visible; the actual list (and item-level detail) is
// opt-in via "Vezi detalii", so the screen isn't dominated by a roster
// most days nobody needs to scroll through.
export default function OverviewPage({ onContinue }) {
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [openSection, setOpenSection] = useState(null); // null | 'athletes' | 'clubs'
  const [openItemId, setOpenItemId] = useState(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    let cancelled = false;
    window.launcher
      .getCloudOverview()
      .then((data) => {
        if (!cancelled) setOverview(data);
      })
      .catch((err) => {
        if (!cancelled) setError(cleanErrorMessage(err, 'Nu s-au putut încărca datele din cloud.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleSection(section) {
    setOpenItemId(null);
    setFilter('');
    setOpenSection((prev) => (prev === section ? null : section));
  }

  const items = openSection === 'athletes' ? overview?.athletes || [] : overview?.clubs || [];
  const filtered = filter
    ? items.filter((item) => JSON.stringify(item).toLowerCase().includes(filter.toLowerCase()))
    : items;

  return (
    <div className="card card--wide">
      <h1>Prezentare generală</h1>
      <p className="subtitle">Ce există chiar acum în baza de date din cloud.</p>

      {error && <div className="error-box">{error}</div>}
      {loading && <p>Se încarcă…</p>}

      {overview && (
        <>
          <div className="stat-row">
            <div className="stat-card">
              <div className="stat-value">{overview.athleteCount}</div>
              <div className="stat-label">Sportivi</div>
              <button className="btn-link" type="button" onClick={() => toggleSection('athletes')}>
                {openSection === 'athletes' ? 'Ascunde detalii' : 'Vezi detalii'}
              </button>
            </div>
            <div className="stat-card">
              <div className="stat-value">{overview.clubCount}</div>
              <div className="stat-label">Cluburi</div>
              <button className="btn-link" type="button" onClick={() => toggleSection('clubs')}>
                {openSection === 'clubs' ? 'Ascunde detalii' : 'Vezi detalii'}
              </button>
            </div>
          </div>

          {openSection && (
            <>
              <input
                type="text"
                placeholder="Caută după nume…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                style={{ marginBottom: 12 }}
                autoFocus
              />

              <ul className="event-list">
                {filtered.length === 0 && <li className="event-meta">Niciun rezultat.</li>}
                {filtered.slice(0, 100).map((item) => (
                  <li key={item.id} className="event-item event-item--stack">
                    <div
                      className="event-item-row"
                      onClick={() => setOpenItemId((prev) => (prev === item.id ? null : item.id))}
                    >
                      <div>
                        <div className="event-name">
                          {openSection === 'athletes' ? `${item.first_name} ${item.last_name}` : item.name}
                        </div>
                        {openSection === 'athletes' && (
                          <div className="event-meta">{item.club?.name || 'Fără club'}</div>
                        )}
                      </div>
                      <span className="chevron">{openItemId === item.id ? '▲' : '▼'}</span>
                    </div>
                    {openItemId === item.id &&
                      (openSection === 'athletes' ? <AthleteDetail athlete={item} /> : <ClubDetail club={item} />)}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn-primary" onClick={onContinue} type="button">
          Continuă → alege evenimentul
        </button>
      </div>
    </div>
  );
}
