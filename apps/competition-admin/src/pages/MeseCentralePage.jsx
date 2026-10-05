import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { fieldAPI } from '@shared/lib/api';

// Codurile pentru mesele centrale, unul per teren.
//
// Pagina asta exista pentru dimineata competitiei. Laptopul de la masa nu are
// nevoie nici de launcher, nici de contul adminului - doar de adresa terenului
// lui. Fara ea, cineva ar trebui sa dicteze un IP la fiecare masa, ceea ce in
// ziua competitiei nu se intampla.
//
// Adresa se construieste din `window.location.origin`: daca pagina a fost
// deschisa prin IP-ul din retea, codul duce tot acolo. Un QR cu "localhost" ar
// arata corect pe calculatorul gazda si n-ar merge pe nimic altceva.
export default function MeseCentralePage() {
  const { id: eventId } = useParams();
  const [terenuri, setTerenuri] = useState([]);
  const [incarca, setIncarca] = useState(true);

  useEffect(() => {
    let anulat = false;
    fieldAPI.list({ event_id: eventId })
      .then(({ data }) => { if (!anulat) setTerenuri(data || []); })
      .catch(() => { if (!anulat) setTerenuri([]); })
      .finally(() => { if (!anulat) setIncarca(false); });
    return () => { anulat = true; };
  }, [eventId]);

  const adresa = (terenId) => `${window.location.origin}/masa/${terenId}`;
  const prinIp = !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);

  return (
    <div className="min-h-screen bg-background px-6 py-8">
      <h1 className="text-2xl font-black text-foreground">Mese centrale</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Câte un cod pentru fiecare teren. Scanează-l de la masa terenului, sau
        scrie adresa în browserul laptopului de acolo. Nu e nevoie de niciun
        cont: pagina cere direct PIN-ul arbitrului care se așază.
      </p>

      {!prinIp && (
        <p className="mt-4 max-w-2xl rounded-md border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Ai deschis pagina prin <strong>{window.location.hostname}</strong>, care
          înseamnă &bdquo;calculatorul acesta&rdquo;. Codurile de mai jos ar duce fiecare laptop
          la el însuși. Deschide pagina prin adresa din rețea a calculatorului care
          ține competiția, apoi arată codurile.
        </p>
      )}

      {incarca && <p className="mt-6 text-sm text-muted-foreground">Se încarcă…</p>}
      {!incarca && terenuri.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">Evenimentul nu are terenuri.</p>
      )}

      <div className="mt-8 flex flex-wrap gap-6">
        {terenuri.map((t) => (
          <div key={t.id} className="flex w-72 flex-col items-center gap-3 rounded-lg border-2 border-border bg-card p-5">
            <p className="text-xl font-black text-foreground">{t.name}</p>
            <div className="bg-white p-3">
              <QRCodeSVG value={adresa(t.id)} size={200} />
            </div>
            <code className="break-all text-center text-xs text-muted-foreground">{adresa(t.id)}</code>
          </div>
        ))}
      </div>
    </div>
  );
}
