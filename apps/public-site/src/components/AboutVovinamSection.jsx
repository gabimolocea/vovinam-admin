import { Link } from 'react-router-dom';
import { ShieldCheck, HeartHandshake, Dumbbell, Users } from 'lucide-react';
import { Button } from './ui';

const PILLARS = [
  { Icon: ShieldCheck, title: 'Autocontrol', text: 'Tehnici eficiente pentru protecție și siguranță.' },
  { Icon: HeartHandshake, title: 'Disciplină & Respect', text: 'Principii fundamentale, învățate la fiecare antrenament.' },
  { Icon: Dumbbell, title: 'Forță & Echilibru', text: 'Dezvoltarea corpului prin exerciții complete.' },
  { Icon: Users, title: 'Comunitate', text: 'O familie unită de valori și pasiune pentru arte marțiale.' },
];

/** Static "About Vovinam" info band for the homepage - the sport's pitch
 * plus a CTA into the unified account/registration page. No CMS-managed
 * copy exists for this yet, so text is authored here directly. */
export default function AboutVovinamSection() {
  return (
    <section className="grid gap-8 lg:grid-cols-2 lg:items-center">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-secondary-foreground/70">
          Practică arta marțială vietnameză
        </p>
        <h2 className="font-display mt-1 text-2xl font-semibold sm:text-3xl">Ce este Vovinam?</h2>
        <p className="mt-3 max-w-xl text-muted-foreground">
          Vovinam Việt Võ Đạo este o artă marțială vietnameză ce îmbină tradiția cu modernitatea,
          oferind practicanților putere fizică, echilibru mental și valori morale.
        </p>
        <Button as={Link} to="/cont?mode=register" className="mt-6">Devino membru</Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {PILLARS.map(({ Icon, title, text }) => (
          <div key={title} className="site-panel flex flex-col gap-2 rounded-lg border p-4">
            <Icon className="h-6 w-6 text-primary" />
            <h3 className="font-display text-sm font-semibold">{title}</h3>
            <p className="text-xs text-muted-foreground">{text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
