import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@shared';
import api from '@shared/lib/api';
import { salveazaMasa } from '../lib/masaCentrala';

// Intrarea la masa centrala a unui teren.
//
// De ce PIN si nu o delegare pe persoana: la masa oamenii se schimba in
// timpul zilei, iar un arbitru de colt poate ajunge la masa si invers. Nicio
// lista tinuta de cineva nu ramane adevarata pana seara. Asa ca terenul da
// dreptul - el e in adresa paginii - iar omul doar spune cine e, cu PIN-ul pe
// care il are deja pentru device. Schimbul de tura nu cere nimic de la nimeni:
// pleaca unul, vine altul, tasteaza PIN-ul lui.
export default function MasaCentralaPage() {
  const { fieldId } = useParams();
  const navigate = useNavigate();
  const { loginWithTokens } = useAuth();
  const [pin, setPin] = useState('');
  const [teren, setTeren] = useState(null);
  const [eroare, setEroare] = useState(null);
  const [lucreaza, setLucreaza] = useState(false);

  // Numele terenului, inainte de autentificare: cineva care deschide din
  // greseala codul altui teren trebuie sa vada asta inainte sa tasteze.
  useEffect(() => {
    let anulat = false;
    api.get(`/competition-fields/${fieldId}/`)
      .then(({ data }) => { if (!anulat) setTeren(data); })
      .catch(() => { if (!anulat) setTeren(null); });
    return () => { anulat = true; };
  }, [fieldId]);

  const intra = async (e) => {
    e.preventDefault();
    setLucreaza(true);
    setEroare(null);
    try {
      const { data } = await api.post('/masa-centrala-login/', { pin: pin.trim(), field: Number(fieldId) });
      salveazaMasa({ field: data.field, referee: data.referee, eventId: data.event_id });
      await loginWithTokens(data.tokens);
      navigate(`/competitions/${data.event_id}/live-fullscreen?field=${data.field.id}`, { replace: true });
    } catch (err) {
      setEroare(err?.response?.data?.error || 'Nu am putut intra. Mai încearcă.');
      setPin('');
      setLucreaza(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-900 px-6 text-white">
      <div className="text-center">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-400">Masă centrală</p>
        <h1 className="mt-1 text-4xl font-black">{teren?.name || `Teren ${fieldId}`}</h1>
      </div>

      <form onSubmit={intra} className="flex w-full max-w-sm flex-col gap-4">
        <label className="text-center text-sm text-slate-300" htmlFor="pin">
          Introdu PIN-ul tău de arbitru
        </label>
        <input
          id="pin"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          className="rounded-lg border-2 border-slate-600 bg-slate-800 px-4 py-4 text-center text-4xl font-black tracking-[0.4em] tabular-nums outline-none focus:border-emerald-500"
          placeholder="·····"
        />
        {eroare && <p className="text-center text-sm font-semibold text-red-400">{eroare}</p>}
        <button
          type="submit"
          disabled={lucreaza || pin.length < 4}
          className="rounded-lg bg-emerald-600 px-4 py-4 text-lg font-black transition hover:bg-emerald-500 disabled:opacity-40"
        >
          {lucreaza ? 'Se verifică…' : 'Intră la masă'}
        </button>
      </form>

      <p className="max-w-sm text-center text-xs text-slate-400">
        Același PIN ca pe dispozitivul de arbitru. Tot ce faci de aici rămâne în
        istoricul probei pe numele tău.
      </p>
    </div>
  );
}
