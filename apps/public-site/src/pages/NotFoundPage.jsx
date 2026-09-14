import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui';
import Seo from '../components/Seo';

const REDIRECT_SECONDS = 8;

/** Catch-all for any URL that doesn't match a known route (old WordPress
 * links Google still has indexed, typos, dead links, etc). Without this,
 * React Router renders nothing at all for an unmatched path - a blank
 * white page instead of any content - since the <Layout> route only
 * renders when one of its children matches. Auto-redirects to the
 * homepage after a short delay so old inbound links still land somewhere
 * useful, but shows a real message first instead of an instant jump. */
export default function NotFoundPage() {
  const navigate = useNavigate();
  const [secondsLeft, setSecondsLeft] = useState(REDIRECT_SECONDS);

  useEffect(() => {
    if (secondsLeft <= 0) {
      navigate('/', { replace: true });
      return undefined;
    }
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft, navigate]);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 py-20 text-center">
      <Seo title="Pagina nu a fost găsită" path="/404" noindex />
      <span className="font-display text-6xl font-bold text-[#0a4c75]">404</span>
      <h1 className="text-fluid-h2 font-display font-bold text-[#00334d]">Pagina nu a fost găsită</h1>
      <p className="text-sm text-muted-foreground">
        Este posibil ca acest link să fie vechi sau să fi fost mutat. Vei fi redirecționat automat către pagina
        principală în {secondsLeft} {secondsLeft === 1 ? 'secundă' : 'secunde'}.
      </p>
      <Button onClick={() => navigate('/', { replace: true })}>Înapoi la pagina principală</Button>
    </div>
  );
}
