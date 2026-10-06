import { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@shared';
import { refereePresenceAPI, categoryRefereeAssignmentAPI } from '@shared/lib/api';
import { stergeMasa } from '../lib/masaCentrala';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from './ui';

// Cine tine masa acum, si cum pleaca de la ea.
//
// Pe un laptop care ramane pornit toata ziua si pe care se schimba oamenii,
// "cine sunt eu acum" nu e o intrebare retorica: de numele asta atarna tot ce
// intra in istoricul probei. Si pentru ca se schimba - un arbitru de la masa
// poate pleca sa arbitreze la colt, iar altul ii ia locul - plecarea trebuie
// sa fie la fel de usoara ca venirea: o apasare si PIN-ul urmatorului.
//
// Fara butonul asta, laptopul ramanea logat pe primul om care s-a asezat, iar
// tot ce facea al doilea intra in istoric pe numele primului.
export default function BaraMasa({ masa, fieldId, categoryId }) {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [confirma, setConfirma] = useState(false);
  const [pleaca, setPleaca] = useState(false);
  // Pe ce pozitie din cele cinci sta, la proba deschisa acum - daca sta.
  const [pozitia, setPozitia] = useState(null);
  const [alocare, setAlocare] = useState(null);
  const refereeId = masa?.referee?.id;

  // Cautam pozitia abia cand se deschide intrebarea, nu la fiecare randare:
  // raspunsul conteaza o singura data, in clipa plecarii.
  useEffect(() => {
    if (!confirma || !categoryId || !refereeId) { setPozitia(null); setAlocare(null); return undefined; }
    let anulat = false;
    categoryRefereeAssignmentAPI.list({ category: categoryId })
      .then((r) => {
        if (anulat) return;
        const a = (r.data?.results || r.data || []).find(x => x.category === categoryId);
        setAlocare(a || null);
        setPozitia(a ? ([1, 2, 3, 4, 5].find(i => a[`referee_${i}`] === refereeId) ?? null) : null);
      })
      .catch(() => { if (!anulat) { setAlocare(null); setPozitia(null); } });
    return () => { anulat = true; };
  }, [confirma, categoryId, refereeId]);

  if (!masa?.referee) return null;

  // `ramaneArbitru`: a plecat de la masa, dar ramane sa dea note de pe telefon
  // sau de pe device. Nu se poate deduce - de-aia se intreaba. Sistemul nu are
  // de unde sti daca a incetat sa arbitreze sau doar sa tina masa.
  const preda = async (ramaneArbitru) => {
    setPleaca(true);
    if (categoryId) {
      // Scos din lista de arbitri conectati: semnalul il dadea laptopul mesei.
      // Daca ramane arbitru, incepe sa semnaleze telefonul lui in locul ei.
      try {
        await refereePresenceAPI.clear({ category: categoryId, referee: masa.referee.id });
      } catch { /* expira oricum in cateva secunde */ }
    }
    if (!ramaneArbitru && alocare && pozitia) {
      try {
        await categoryRefereeAssignmentAPI.update(alocare.id, { [`referee_${pozitia}`]: null });
      } catch (e) { console.error('Nu am putut elibera poziția', e); }
    }
    stergeMasa();
    await logout();
    navigate(`/masa/${fieldId}`, { replace: true });
  };

  return (
    <>
      {/* Numele nu mai sta scris in bara. Cine e la masa conteaza in clipa
          plecarii - cand il intreaba dialogul - si in istoric, unde ramane
          oricum pe fiecare actiune. Scris permanent, era doar zgomot pe un
          ecran plin de butoane. */}
      <button
        type="button"
        onClick={() => setConfirma(true)}
        title={`Delogare (${masa.referee.name})`}
        className="inline-flex items-center gap-1.5 rounded-md border border-white/30 bg-white/10 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-white/20"
      >
        <LogOut className="h-3.5 w-3.5" />
        Delogare
      </button>

      {confirma && (
        <Dialog open onOpenChange={(o) => { if (!o) setConfirma(false); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Te deloghezi de la masă, {masa.referee.name}?</DialogTitle>
              <DialogDescription>
                Ieși de pe acest calculator, iar următorul arbitru intră cu PIN-ul
                lui. Proba rămâne cum e - nu se oprește și nu se pierde nimic.
              </DialogDescription>
            </DialogHeader>

            {pozitia ? (
              <div className="rounded-md border-2 border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                <p className="font-bold">Rămâi arbitru la proba asta, pe poziția A{pozitia}?</p>
                <p className="mt-1">
                  Dacă rămâi, dai notele mai departe de pe telefon sau de pe dispozitiv,
                  cu același PIN. Dacă nu, poziția A{pozitia} se eliberează pentru altcineva.
                </p>
              </div>
            ) : null}

            <DialogFooter>
              <button
                type="button"
                onClick={() => setConfirma(false)}
                className="rounded-md border border-input bg-background px-4 py-2.5 font-semibold text-foreground transition hover:bg-accent"
              >
                Rămân la masă
              </button>
              {pozitia ? (
                <>
                  <button
                    type="button"
                    disabled={pleaca}
                    onClick={() => preda(false)}
                    className="rounded-md border border-input bg-background px-4 py-2.5 font-semibold text-foreground transition hover:bg-accent disabled:opacity-40"
                  >
                    Nu, eliberează A{pozitia}
                  </button>
                  <button
                    type="button"
                    disabled={pleaca}
                    onClick={() => preda(true)}
                    className="rounded-md bg-amber-500 px-4 py-2.5 font-bold text-amber-950 transition hover:bg-amber-400 disabled:opacity-40"
                  >
                    {pleaca ? 'Se deloghează…' : 'Da, rămân arbitru'}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={pleaca}
                  onClick={() => preda(true)}
                  className="rounded-md bg-amber-500 px-4 py-2.5 font-bold text-amber-950 transition hover:bg-amber-400 disabled:opacity-40"
                >
                  {pleaca ? 'Se deloghează…' : 'Da, mă deloghez'}
                </button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

    </>
  );
}
