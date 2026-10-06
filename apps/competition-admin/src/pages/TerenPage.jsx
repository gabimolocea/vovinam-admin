import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  fieldAPI, matchFieldAssignmentAPI, categoryAPI, groupAPI, monitorAPI,
} from '@shared/lib/api';
import { GENDER_BG } from './CategoriesLayout';
import { formatGroupBadgeLabel } from '../components/ui';
import { citesteMasa } from '../lib/masaCentrala';
import BaraMasa from '../components/BaraMasa';

// Ce are de facut terenul asta azi.
//
// Pagina "Înapoi" a mesei centrale. Pana acum ducea la lista probelor zilei,
// care e o pagina de admin si arata toate terenurile - adica tocmai ce nu
// trebuie sa vada si nu poate atinge cineva care tine o singura masa.
//
// Arata exact ca lista din pagina Live a adminului: aceleasi doua taburi,
// aceleasi carduri, aceleasi culori de stare. Cine a vazut-o acolo nu are
// nimic de invatat aici - singura deosebire e ca lista se opreste la terenul
// lui.
//
// "În curs" tine si ce a inceput, si ce urmeaza: intrebarea de la masa e "ce
// mai am de facut", nu "ce rulează chiar acum" - aia se vede din bulina verde.

const STATUS_CFG = {
  not_started: { dot: 'bg-muted-foreground/40', bg: 'bg-card', border: 'border-border' },
  in_progress: { dot: 'bg-emerald-500 animate-pulse', bg: 'bg-emerald-50 dark:bg-emerald-950/20', border: 'border-emerald-300 dark:border-emerald-800' },
  completed: { dot: 'bg-slate-400', bg: 'bg-muted', border: 'border-border' },
};
const ETICHETE_MECI = { qualifications: 'Calificări', 'quarter-finals': 'Sferturi', 'semi-finals': 'Semi-finală', finals: 'Finală', bronze: 'Bronz' };
const ETICHETE_GEN = { male: 'Masculin', female: 'Feminin', mixt: 'Mixt' };

const lista = r => r.data?.results || r.data || [];

export default function TerenPage() {
  const { id: eventId, fieldId } = useParams();
  const navigate = useNavigate();
  const masa = citesteMasa();
  const nr = Number(fieldId);

  const [teren, setTeren] = useState(null);
  const [probe, setProbe] = useState([]);
  const [meciuri, setMeciuri] = useState([]);
  const [categorii, setCategorii] = useState([]);
  const [grupe, setGrupe] = useState([]);
  const [sesiune, setSesiune] = useState(null);
  const [incarca, setIncarca] = useState(true);
  const [tab, setTab] = useState('active');

  const adu = useCallback(async () => {
    try {
      const [t, p, m, c, g, s] = await Promise.all([
        fieldAPI.list({ event_id: eventId }),
        fieldAPI.assignments.list({ event_id: eventId }),
        matchFieldAssignmentAPI.list({ event_id: eventId }),
        categoryAPI.list({ event_id: eventId }),
        groupAPI.list({ event_id: eventId }),
        monitorAPI.sessions.list({ event_id: eventId }),
      ]);
      setTeren(lista(t).find(f => f.id === nr) || null);
      setProbe(lista(p).filter(a => a.field === nr));
      setMeciuri(lista(m).filter(a => a.field === nr));
      setCategorii(lista(c));
      setGrupe(lista(g));
      setSesiune(lista(s).find(x => x.field === nr) || null);
    } catch (e) {
      console.error(e);
    }
    setIncarca(false);
  }, [eventId, nr]);

  useEffect(() => { adu(); }, [adu]);
  // Starile se schimba de la alt calculator (sau de la masa insasi, intr-o
  // alta fila), deci lista se improspateaza singura.
  useEffect(() => {
    const ceas = setInterval(adu, 5000);
    return () => clearInterval(ceas);
  }, [adu]);

  const catDupaId = useMemo(() => {
    const grupaDupaId = new Map(grupe.map(g => [g.id, g]));
    return new Map(categorii.map(c => [c.id, {
      ...c, groupName: formatGroupBadgeLabel(grupaDupaId.get(c.group), c),
    }]));
  }, [categorii, grupe]);

  const randuri = useMemo(() => [
    ...probe.map(a => ({
      cheie: `c-${a.id}`, fel: 'category', itemId: a.category,
      stare: a.status, ordine: a.order ?? 0, date: catDupaId.get(a.category), alocare: a,
    })),
    ...meciuri.map(a => ({
      cheie: `m-${a.id}`, fel: 'match', itemId: a.match,
      stare: a.status, ordine: a.order ?? 0, date: catDupaId.get(a.category_id), alocare: a,
    })),
  ].sort((x, y) => x.ordine - y.ordine), [probe, meciuri, catDupaId]);

  const inCurs = randuri.filter(r => r.stare !== 'completed');
  const finalizate = randuri.filter(r => r.stare === 'completed');
  const vizibile = tab === 'completed' ? finalizate : inCurs;

  const deschide = (r) => navigate(
    `/competitions/${eventId}/live-fullscreen?field=${fieldId}&panel=${r.fel}&id=${r.itemId}`);

  const peEcran = (r) => (r.fel === 'category'
    ? sesiune?.current_category === r.itemId && !sesiune?.current_match
    : sesiune?.current_match === r.itemId);

  const Insigna = ({ children, clasa = '' }) => (
    <span className={`inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-foreground ${clasa}`}>
      {children}
    </span>
  );

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex items-center justify-between gap-3 bg-sidebar px-4 py-3 text-sidebar-foreground">
        <span className="text-base font-black uppercase tracking-wide text-sidebar-accent">
          {teren?.name || `Teren ${fieldId}`}
        </span>
        <BaraMasa masa={masa} fieldId={fieldId} />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto bg-muted/30">
        <div className="sticky top-0 z-10 flex border-b-2 border-border bg-card">
          {[
            { key: 'active', label: 'În curs', count: inCurs.length },
            { key: 'completed', label: 'Finalizate', count: finalizate.length },
          ].map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`flex-1 border-b-2 px-3 py-2 text-xs font-bold uppercase tracking-wide transition ${
                tab === t.key
                  ? 'border-primary text-primary'
                  : '-mb-0.5 border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label} ({t.count})
            </button>
          ))}
        </div>

        <div className="space-y-1.5 p-2">
          {incarca && <p className="py-6 text-center text-sm italic text-muted-foreground">Se încarcă…</p>}
          {!incarca && vizibile.length === 0 && (
            <p className="py-6 text-center text-sm italic text-muted-foreground">
              {tab === 'completed' ? 'Nicio probă finalizată.' : 'Nimic programat pe terenul acesta.'}
            </p>
          )}

          {vizibile.map((r) => {
            const st = STATUS_CFG[r.stare] || STATUS_CFG.not_started;
            const peTv = peEcran(r);
            const d = r.date;
            return (
              <div
                key={r.cheie}
                onClick={() => deschide(r)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); deschide(r); } }}
                className={`relative flex cursor-pointer flex-wrap items-center gap-2 rounded-md border px-3 py-2 transition hover:shadow-md ${
                  r.stare === 'completed'
                    ? 'border-border bg-muted/50 opacity-60 hover:opacity-100'
                    : peTv
                      ? 'border-emerald-400 bg-emerald-50 ring-2 ring-emerald-300 shadow-sm dark:border-emerald-700 dark:bg-emerald-950/20'
                      : `${st.border} ${st.bg} hover:shadow-sm`
                }`}
              >
                {/* Stampila de pe Programare, aceeasi: ce s-a terminat se
                    recunoaste dintr-o privire, fara sa citesti randul. Aici
                    cardul ramane apasabil - tocmai de aia exista tabul
                    Finalizate, ca sa te poti intoarce sa verifici ceva. */}
                {r.stare === 'completed' && (
                  <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                    <span className="-rotate-6 text-2xl font-black uppercase tracking-wider text-green-700/70">
                      Finalizat
                    </span>
                  </div>
                )}
                <span className={`h-3.5 w-3.5 shrink-0 rounded-full ${r.stare === 'completed' ? 'bg-muted-foreground/40' : st.dot}`} />

                <div className="min-w-0 flex-1">
                  {r.fel === 'category' ? (
                    <>
                      <span className="block whitespace-normal break-words text-sm font-bold text-foreground md:text-base">
                        {d?.name || r.alocare.category_name}
                      </span>
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {d?.groupName && <Insigna>{d.groupName}</Insigna>}
                        {d?.gender && (
                          <span className={`rounded border border-border px-1.5 py-0.5 text-xs text-foreground/80 ${GENDER_BG[d.gender] || 'bg-muted'}`}>
                            {String(ETICHETE_GEN[d.gender] || d.gender).toUpperCase()}
                          </span>
                        )}
                        {d && (() => {
                          const eEchipe = d.type === 'team';
                          const cati = eEchipe ? (d.enrolled_teams?.length || 0) : (d.enrolled_athletes?.length || 0);
                          return (
                            <Insigna>
                              {cati} {eEchipe ? `echip${cati === 1 ? 'ă' : 'e'}` : `sportiv${cati !== 1 ? 'i' : ''}`}
                            </Insigna>
                          );
                        })()}
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="whitespace-normal break-words text-sm font-bold uppercase leading-snug md:text-base">
                        <span className="text-red-600">{r.alocare.red_corner_name || 'TBD'}</span>
                        <span className="mx-1 font-bold normal-case text-muted-foreground/60">VS</span>
                        <span className="text-blue-600">{r.alocare.blue_corner_name || 'TBD'}</span>
                        <span className="normal-case text-muted-foreground"> [{r.itemId}]</span>
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {d?.groupName && <Insigna>{d.groupName}</Insigna>}
                        {(d?.name || r.alocare.category_name) && (
                          <Insigna clasa="whitespace-normal break-words">{d?.name || r.alocare.category_name}</Insigna>
                        )}
                        {d?.gender && (
                          <span className={`rounded border border-border px-1.5 py-0.5 text-xs text-foreground/80 ${GENDER_BG[d.gender] || 'bg-muted'}`}>
                            {String(ETICHETE_GEN[d.gender] || d.gender).toUpperCase()}
                          </span>
                        )}
                        {r.alocare.match_type && (
                          <span className="rounded border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                            {ETICHETE_MECI[r.alocare.match_type] || r.alocare.match_type}
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
