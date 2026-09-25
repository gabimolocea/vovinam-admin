import { useCallback, useEffect, useRef, useState } from 'react';
import api from '@shared/lib/api';

// Cât de tare trebuie să fie ca să numărăm că cineva vorbește, și cât
// de multă liniște înseamnă că a terminat. Pragul e deliberat sus:
// într-o sală plină, orice prag mic înseamnă transcrieri continue pe
// zgomot de fundal.
const SPEECH_RMS = 0.045;
const SILENCE_MS = 700;
const MAX_UTTERANCE_MS = 6000;
const MIN_UTTERANCE_MS = 400;

// Confirmarea se aude în cască, nu se citește: arbitrul central are
// ochii pe saltea, acolo e tot rostul funcției.
function say(text) {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ro-RO';
    u.rate = 1.1;
    window.speechSynthesis.speak(u);
  } catch { /* fără voce, rămâne banda de pe ecran */ }
}

/**
 * Ascultă continuu și raportează comenzile recunoscute.
 *
 * Ascultarea continuă e intenționată: cazul de folosire e exact acela în
 * care nu stă nimeni la masă să apese ceva. De aceea comanda cere un
 * cuvânt de activare - serverul respinge orice rostire fără el, iar
 * arbitrul poate vorbi liber cu sportivii fără să declanșeze nimic.
 */
export function useVoiceAssistant({ enabled, onCommand }) {
  const [status, setStatus] = useState('oprit');
  const [lastHeard, setLastHeard] = useState(null);
  const [error, setError] = useState(null);

  const streamRef = useRef(null);
  const ctxRef = useRef(null);
  const recRef = useRef(null);
  const chunksRef = useRef([]);
  const loopRef = useRef(null);
  const onCommandRef = useRef(onCommand);
  onCommandRef.current = onCommand;

  const send = useCallback(async (blob) => {
    setStatus('se transcrie');
    try {
      const { data } = await api.post('/voice-command/', blob, {
        headers: { 'Content-Type': 'application/octet-stream' },
        transformRequest: [(d) => d],
      });

      // „Fără activare" e cazul obișnuit, nu o eroare: arbitrul central
      // vorbește tot meciul. Nu-l arătăm și nu-l anunțăm.
      if (data.code === 'fara_activare' || data.code === 'tacere') {
        setStatus('ascult');
        return;
      }

      setLastHeard(data);
      if (data.code === 'ok') {
        onCommandRef.current?.(data.command, data);
      } else {
        say('nu am înțeles');
      }
    } catch (err) {
      const detail = err?.response?.data?.error || err.message;
      setError(detail);
      setStatus('eroare');
      return;
    }
    setStatus('ascult');
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;
    let speaking = false;
    let silentSince = 0;
    let startedAt = 0;

    (async () => {
      if (!navigator.mediaDevices) {
        setError('Microfonul nu e disponibil: pagina trebuie deschisă pe localhost sau pe https.');
        setStatus('eroare');
        return;
      }
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch (err) {
        setError(`Fără acces la microfon: ${err.message}`);
        setStatus('eroare');
        return;
      }
      if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }

      streamRef.current = stream;
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      ctxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      setStatus('ascult');

      // Pornim înregistrarea abia când cineva chiar vorbește. Altfel am
      // trimite la transcriere câteva sute de fragmente de liniște pe
      // minut, degeaba.
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length);
        const now = Date.now();

        if (!speaking && rms > SPEECH_RMS) {
          speaking = true;
          startedAt = now;
          silentSince = 0;
          chunksRef.current = [];
          try {
            const rec = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            rec.ondataavailable = e => chunksRef.current.push(e.data);
            rec.onstop = () => {
              const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
              if (blob.size > 0) send(blob);
            };
            rec.start();
            recRef.current = rec;
            setStatus('aud ceva');
          } catch { speaking = false; }
        } else if (speaking) {
          const tooLong = now - startedAt > MAX_UTTERANCE_MS;
          if (rms > SPEECH_RMS) silentSince = 0;
          else if (!silentSince) silentSince = now;

          const doneTalking = silentSince && now - silentSince > SILENCE_MS;
          if (doneTalking || tooLong) {
            speaking = false;
            const rec = recRef.current;
            recRef.current = null;
            // Prea scurt ca să fie o comandă: o tuse, un scaun mutat.
            if (rec && rec.state !== 'inactive') {
              if (now - startedAt < MIN_UTTERANCE_MS) {
                rec.ondataavailable = null;
                rec.onstop = null;
              }
              rec.stop();
            }
          }
        }
      };

      loopRef.current = setInterval(tick, 50);
    })();

    return () => {
      cancelled = true;
      if (loopRef.current) clearInterval(loopRef.current);
      if (recRef.current && recRef.current.state !== 'inactive') {
        recRef.current.ondataavailable = null;
        recRef.current.onstop = null;
        recRef.current.stop();
      }
      recRef.current = null;
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      ctxRef.current?.close();
      ctxRef.current = null;
      setStatus('oprit');
      setLastHeard(null);
    };
  }, [enabled, send]);

  return { status, lastHeard, error, say };
}
