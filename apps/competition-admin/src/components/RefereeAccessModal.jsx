import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { refereeQrLoginAPI } from '@shared/lib/api';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from './ui';

// Portul aplicatiei de arbitraj. Aceeasi gazda, alt port: admin-ul si
// aplicatia arbitrilor pot fi deschise de pe dispozitive diferite din
// LAN-ul salii, deci nu se poate lega de localhost.
const REFEREE_SCORING_PORT = 5176;

function refereeScoringOrigin() {
  const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  return `http://${host}:${REFEREE_SCORING_PORT}`;
}

const MODAL_SECONDARY_BUTTON = 'rounded-md border border-input bg-background px-4 py-2.5 font-semibold text-foreground transition hover:bg-accent disabled:opacity-40';
const MODAL_WARNING_BUTTON = 'rounded-md bg-amber-400 px-4 py-2.5 font-bold text-amber-950 transition hover:bg-amber-300 disabled:opacity-40';

function FullscreenModal({ onClose, title, description, actions, children }) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose?.(); }}>
      <DialogContent fullScreen>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children ? <div className="flex-1 space-y-4">{children}</div> : null}
        {actions ? <DialogFooter>{actions}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  );
}

// Datele cu care un arbitru intra in sesiune: codul QR pentru telefon si
// PIN-ul pentru dispozitivul cu buton rotativ, care nu are nici tastatura
// nici camera. Acelasi credential in doua forme, si acelasi buton le
// roteste pe amandoua.
//
// Component, nu bucata copiata in fiecare panou: exista si la tehnica si
// la lupte, iar doua copii ar fi divergat la prima modificare.
export default function RefereeAccessModal({ eventId, referee, onClose }) {
  const [info, setInfo] = useState(null);      // { token, pin, login_path }
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Ia (sau creeaza) codul de conectare. Nu roteste niciodata unul
  // existent: redeschiderea ferestrei mai tarziu in zi nu are voie sa
  // scoata din aplicatie un arbitru care s-a conectat de dimineata.
  useEffect(() => {
    if (!referee?.id || !eventId) { setInfo(null); return undefined; }
    let cancelled = false;
    setLoading(true);
    setInfo(null);
    refereeQrLoginAPI.get(eventId, referee.id)
      .then(({ data }) => { if (!cancelled) setInfo(data); })
      .catch((err) => { console.error('Nu s-a putut citi codul arbitrului', err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [referee?.id, eventId]);

  const reset = async () => {
    if (!referee?.id || !eventId) return;
    setResetting(true);
    try {
      const { data } = await refereeQrLoginAPI.reset(eventId, referee.id);
      setInfo(data);
    } catch (err) {
      console.error('Nu s-a putut reseta codul arbitrului', err);
      window.alert('Nu s-a putut reseta codul.');
    }
    setResetting(false);
  };

  if (!referee) return null;

  return (
    <FullscreenModal
      onClose={onClose}
      title={`Conectare arbitru — A${referee.pos} ${referee.name || ''}`}
      description="Pe telefon: arbitrul scanează codul și intră direct în aplicația de arbitraj, fără email și parolă. Pe dispozitivul cu buton rotativ: formează PIN-ul. Amândouă rămân valabile toată ziua - resetează-le doar dacă au fost pierdute sau expuse."
      actions={[
        <button key="close" onClick={onClose} className={MODAL_SECONDARY_BUTTON}>Închide</button>,
        <button key="reset" onClick={reset} disabled={loading || resetting} className={MODAL_WARNING_BUTTON}>
          {resetting ? 'Se resetează…' : 'Resetează codul și PIN-ul'}
        </button>,
      ]}
    >
      <div className="flex flex-col items-center gap-3 py-2">
        {['localhost', '127.0.0.1'].includes(window.location.hostname) && (
          <div className="w-full border-2 border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Ești pe <strong>localhost</strong> — codul QR va trimite telefonul arbitrului tot spre &bdquo;localhost al lui&rdquo;, nu spre acest calculator, deci nu va funcționa. Deschide pagina folosind adresa IP din rețeaua locală înainte să arăți codul unui arbitru. PIN-ul nu e afectat: dispozitivul are adresa serverului scrisă în el.
          </div>
        )}
        {loading || !info ? (
          <div className="flex h-48 w-48 items-center justify-center border-2 border-dashed border-border text-sm text-muted-foreground">
            Se încarcă…
          </div>
        ) : (
          <div className="border-2 border-border bg-white p-3">
            <QRCodeSVG value={`${refereeScoringOrigin()}${info.login_path}`} size={192} />
          </div>
        )}
        {info?.pin && (
          <div className="w-full border-2 border-border bg-muted/40 px-3 py-2 text-center">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              PIN pentru dispozitivul de arbitraj
            </div>
            <div className="font-mono text-3xl font-bold tracking-[0.3em] text-foreground">{info.pin}</div>
          </div>
        )}
        <p className="text-xs text-muted-foreground">Cod stabil pentru acest arbitru la acest eveniment - nu se schimbă între probe.</p>
      </div>
    </FullscreenModal>
  );
}
