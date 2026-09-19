import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, Button, Card } from './ui';

const APPS = [
  { id: 'competition-admin', name: 'Competition Admin', description: 'Administrare competiții', port: 5173 },
  { id: 'coach-dashboard', name: 'Coach Dashboard', description: 'Panou antrenori', port: 5175 },
  { id: 'referee-scoring', name: 'Referee Scoring', description: 'Punctaj arbitri', port: 5176 },
  { id: 'public-display', name: 'Public Display', description: 'Afișaj public', port: 5177 },
];

export default function AppLauncherPanel({ buttonClassName = '' }) {
  const [open, setOpen] = useState(false);

  const appLinks = useMemo(() => {
    const host = window.location.hostname || 'localhost';
    const protocol = window.location.protocol || 'http:';
    return APPS.map((app) => ({
      ...app,
      url: `${protocol}//${host}:${app.port}`,
    }));
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant={buttonClassName ? undefined : 'outline'}
        size={buttonClassName ? undefined : 'sm'}
        onClick={() => setOpen(true)}
        className={buttonClassName || 'border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-white/10 hover:text-sidebar-foreground'}
      >
        Aplicații
      </Button>

      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Panou aplicații</DialogTitle>
          <DialogDescription>Acces rapid către toate aplicațiile frontend</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {appLinks.map((app) => (
            <Card key={app.id} as="a" href={app.url} target="_blank" rel="noreferrer" className="block p-3 transition hover:bg-accent">
              <p className="text-sm font-semibold text-foreground">{app.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{app.description}</p>
              <p className="mt-2 text-[11px] font-medium text-primary">{app.url}</p>
            </Card>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
