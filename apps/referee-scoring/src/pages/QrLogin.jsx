import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { refereeQrLoginAPI } from '@shared/lib/api';
import { useAuth } from '@shared';
import { Spinner } from '../components/ui';

// Landing page for the QR code shown on competition-admin's live match
// panel - exchanges the token in the URL for a real session the instant
// it loads, so scanning the code is the entire login flow. The token
// itself doesn't expire on its own; only an admin resetting it (a fresh
// QR) invalidates this link, so the same code works all day.
export default function QrLogin() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { loginWithTokens } = useAuth();
  const [error, setError] = useState('');
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (attemptedRef.current) return;
    attemptedRef.current = true;
    (async () => {
      try {
        const { data } = await refereeQrLoginAPI.exchange(token);
        await loginWithTokens(data.tokens);
        navigate('/', { replace: true });
      } catch (err) {
        setError(err.response?.data?.error || 'Codul QR nu mai este valabil. Cere unui admin un cod nou.');
      }
    })();
  }, [token, loginWithTokens, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      {error ? (
        <div className="max-w-sm rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <Spinner />
          <p className="text-sm text-muted-foreground">Se conectează…</p>
        </div>
      )}
    </div>
  );
}
