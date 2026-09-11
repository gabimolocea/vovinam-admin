import Breadcrumbs from '../components/Breadcrumbs';
import Seo from '../components/Seo';

const FIGHT_STAGES = [
  {
    title: 'Etapa precompetițională',
    body: 'este aceea în care practicantul începe inițierea în tainele procedeelor de arte marțiale și dobândește primele noțiuni de strategie. Este etapa în care deja trebuie să ne preocupăm de aspectele motivaționale, de cultivarea dorinței de autodepășire a practicantului.',
  },
  {
    title: 'Etapa competițională',
    body: 'este aceea în care, așa cum am arătat anterior, trebuie să integrăm cele două aspecte principale ale practicii artelor marțiale, cea aplicativă și cea sportivă. Este, din punctul de vedere al etapizării proceselor de învățare, corespunzătoare etapei de perfecționare și atingere a măiestriei tehnice.',
  },
  {
    title: 'Etapa postcompetițională',
    body: 'este cea în care, atât pe considerentul atingerii scopului propus prin activitatea competițională cât și pe considerentul vârstei, practicantul încetează activitatea sportivă, urmând ca în continuare să aprofundeze aspectele mai subtile ale artei marțiale în paralel cu implicarea sa în promovarea și dezvoltarea stilului său, prin cultivarea unor noi generații de practicanți.',
  },
];

const FORM_TRAINING_QUALITIES = [
  'de gândire tactică complexă, combinând strategii de atac și apărare variate,',
  'de orientare în spațiu, pentru că acțiunea se desfășoară în cele patru direcții și cele trei niveluri, contra unuia sau mai multor adversari, imaginari sau reali,',
  'de adaptare la efort intens a sistemelor cardiovascular și respirator, și deci creșterea capacității de rezistență la efort a organismului, precum și dezvoltarea capacităților combinate de viteză și forță în regim de rezistență, atât de prețuite în lupta liberă.',
];

const FORM_JUDGING_CRITERIA = [
  'respectarea traseului și succesiunii tehnicilor și combinațiilor,',
  'nivelul pregătirii fizice, caracteristică a tuturor probelor sportive și capacitatea de execuție perfectă a tehnicilor și combinațiilor tactice în condiții de efort intens,',
  'realismul trăirii marțiale prin aprecierea ritmului execuției, a expresiei privirii și a „exploziei” de energie.',
];

function SectionLabel({ children }) {
  return (
    <div className="flex items-center gap-4">
      <span className="shrink-0 text-sm font-bold uppercase tracking-wide text-[#da3b26]">{children}</span>
      <span className="h-px flex-1 bg-[#edb654]" aria-hidden="true" />
    </div>
  );
}

export default function CompetitionPage() {
  return (
    <div className="flex flex-col">
      <Seo
        title="Competiția Vovinam Việt Võ Đạo"
        description="Rolul competiției sportive - probele de luptă și probele tehnice - în formarea practicantului de Vovinam Việt Võ Đạo."
        path="/competitie"
      />

      <div className="site-full-bleed relative flex flex-col items-center overflow-hidden pb-16 sm:pb-20">
        <img src="/events-section-bg.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(180deg, rgba(12,33,61,0.6) 0%, rgba(12,33,61,0.68) 100%)' }}
        />
        <Breadcrumbs items={[{ label: 'Competiție' }]} showCurrent overlay />
        <div className="relative mx-auto mt-8 w-full max-w-7xl px-4 sm:mt-10">
          <h1 className="text-fluid-display font-display font-bold text-white">Competiția Việt Võ Đạo</h1>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-12 px-4 py-10 sm:py-16">
        <div className="flex flex-col gap-4 rounded-2xl bg-[#e9ecef] p-6 sm:p-10">
          <p className="text-base leading-relaxed text-[#00334d]">
            Din rațiunea de a exersa tehnicile, tacticile și strategiile de luptă, dacă nu în condiții reale măcar
            în condiții „realiste”, au apărut sporturile de luptă.
          </p>
          <p className="text-base leading-relaxed text-[#00334d]">
            Studiul disciplinelor marțiale aplicative nu mai poate fi conceput astăzi fără desfășurarea în paralel
            a unei activități de natură sportivă, iar Vovinam s-a înscris în acest curent de la început, școala
            noastră fiind creată când deja stilurile majore și de referință ale momentului respectiv aveau sisteme
            competiționale bine puse la punct. Vovinam, ca disciplină marțială complexă, oferă o largă varietate
            de tehnici și strategii de autoapărare și luptă dar și un sistem competițional modern și complet.
          </p>
          <p className="text-base leading-relaxed text-[#00334d]">
            Bogăția tehnico-tactică a programei de instruire este completată de viziunea morală și filosofică a
            Vovinam-ului asupra rolului în societate al practicantului și este sintetizată prin sintagma:{' '}
            <strong className="text-[#da3b26]">„a fi puternic pentru a fi util”</strong>. Unul dintre mijloacele
            esențiale utilizate pentru atingerea acestei viziuni este competiția sportivă.
          </p>
        </div>

        <section className="flex flex-col gap-6">
          <SectionLabel>Rolul probei de luptă</SectionLabel>
          <h2 className="text-fluid-h2 font-display font-bold text-[#00334d]">
            Competiția de luptă și integrarea activității sportive de luptă cu practica artelor marțiale
          </h2>

          <div className="flex flex-col gap-4 text-base leading-relaxed text-[#00334d]/90">
            <p>
              Una din cele mai importante idei și descoperiri din artele marțiale este aceea că prin practica
              intensă și constantă a luptei libere se dezvoltă o calitate importantă, rară, dar foarte valoroasă,
              și anume un anumit tip de intuiție.
            </p>
            <p>
              Dacă facem un calcul simplu, vom constata că timpul cheltuit de către atacator pentru a decide și a
              declanșa atacul este întotdeauna mai mic decât timpul necesar celui care este pus în situația de a se
              apăra, deoarece intervine etapa în care acesta trebuie să perceapă tipul de atac, să analizeze și să
              ia decizia de a reacționa, și mai apoi să declanșeze apărarea sau contraatacul. Singura soluție care
              ne rămâne este ca prin exersarea îndelungată a luptei libere să ne dezvoltăm acea percepție
              subconștientă, subtilă, a celor mai mici semne care anunță declanșarea unui tip sau al altuia de
              atac, iar acest lucru să ne dea posibilitatea de a recupera acel handicap de timp.
            </p>
            <p>
              A practica arte marțiale în scop de autoapărare și luptă, și în același timp a participa la
              activități competiționale de luptă sportivă, nu reprezintă un compromis atât timp cât înțelegem
              rolul activității competiționale ca fiind un mijloc specific de pregătire în formarea practicantului
              de arte marțiale complet.
            </p>
            <p>
              O importantă cheie a performanței este integrarea judicioasă a tuturor aspectelor și obiectivelor
              procesului de instruire și antrenament.
            </p>
            <p>
              Înțelegerea acestui concept de integrare a activității competiționale cu practica artei marțiale
              tradiționale este de o importanță majoră, pentru că doar astfel se vor putea concepe în mod corect
              și echilibrat programele de lecții și cicluri de pregătire. Doar astfel, integrând judicios
              mijloacele de pregătire, se va putea practica arta marțială în respectul normelor și idealurilor
              moștenite prin tradiție, și în același timp se vor putea îndeplini obiectivele de performanță în
              activitatea competițională.
            </p>
            <p>
              Activitatea competițională este limitată atât de atingerea scopului practic propus cât și de vârstă.
              De aceea este important să integrăm activitatea competițională și sportivă cu marile etape de
              instruire din viața practicantului de arte marțiale, iar din acest punct de vedere putem vorbi de o
              etapă premergătoare activității competiționale, de etapa de implicare competițională și integrare a
              activității sportive cu celelalte obiective specifice de pregătire din arta marțială, și în fine, de
              o etapă postcompetițională.
            </p>

            <div className="flex flex-col gap-4 border-l-4 border-[#edb654] pl-4 sm:pl-6">
              {FIGHT_STAGES.map(({ title, body }) => (
                <p key={title}>
                  <strong className="text-[#00334d]">{title}</strong> {body}
                </p>
              ))}
            </div>

            <p>
              Se cuvine să atragem atenția asupra existenței a încă unui nivel de integrare, poate chiar cel mai
              important dintre toate conceptele enunțate până acum și anume, asupra integrării abilităților
              marțiale de luptă dobândite în urma procesului de pregătire și antrenament cu viața de zi cu zi.
            </p>
            <p>
              Majoritatea conflictelor și agresiunilor cărora trebuie să le facem față în viață, poate chiar zilnic,
              nu sunt de natură fizică. Ele pot fi conflicte verbale, șantaje subtile sau chiar înfruntări de tipul
              negocierilor. Este important să înțelegem că reflexele de apărare și contraatac dobândite în sala de
              antrenament, precum și acea intuiție specifică care se dezvoltă în urma practicii sincere și
              susținute a artelor marțiale, ne vor ajuta în toate aceste tipuri de situații, transformându-ne din
              învingători pe suprafața de luptă, în învingători în viață.
            </p>
          </div>
        </section>

        <section className="flex flex-col gap-6">
          <SectionLabel>Rolul probei tehnice</SectionLabel>
          <h2 className="text-fluid-h2 font-display font-bold text-[#00334d]">
            Rolul competițiilor sportive la probele tehnice în formarea practicantului de Vovinam Việt Võ Đạo
          </h2>

          <div className="flex flex-col gap-4 text-base leading-relaxed text-[#00334d]/90">
            <p>
              Esența metodelor tradiționale de luptă și autoapărare este utilizarea armelor naturale sau a
              diverselor arme albe și obiecte în scopul anihilării unuia sau a mai multor adversari, prin atacarea
              zonelor vulnerabile, vitale. Strategiile, tacticile prin care putem utiliza eficient aceste arme,
              naturale sau tradiționale, în același timp apărându-ne în fața atacurilor adversarilor, sunt
              nenumărate.
            </p>
            <p>
              Principiile și tehnicile de bază sunt însă aproape întotdeauna aceleași, însă abordarea particulară,
              specifică a acestor principii și tehnici este cea care dă caracterul aparte diferitelor școli și
              stiluri de arte marțiale. În componența formelor sunt codificate de obicei nu doar procedeele
              tehnice, ci mai ales concepția tactică și strategică a școlilor și stilurilor.
            </p>
            <p>
              Pentru toate aceste școli, întrecerea sportivă s-a dovedit a fi mijlocul esențial de călire a
              spiritului și de punere în aplicare și verificare a principiilor tactice ale școlii. Totuși, gama de
              tehnici ce pot fi utilizate într-o întrecere sportivă de luptă este mult restrânsă datorită
              periculozității majorității acestor tehnici, iar de utilizarea armelor albe nici nu poate fi vorba.
            </p>
            <p>
              Astfel, o importanță aparte în școlile de arte marțiale tradiționale o capătă competițiile de
              tehnică, cu sau fără arme, ca forme individuale sau perechi, impuse sau creative. Aici utilizarea
              armelor este fie nelimitată în cazul formelor individuale, pentru că este vorba de unul sau mai
              mulți adversari imaginari a căror integritate nu poate fi pusă în pericol, fie perfect controlată în
              cazul formelor regizate cu parteneri, a căror integritate nu trebuie pusă în pericol.
            </p>
            <p>
              Formele, fie că este vorba de cele individuale, fie de cele cu unul sau mai mulți parteneri,
              reprezintă atât metode superioare de antrenament în artele marțiale cât și probe de competiție
              sportivă.
            </p>

            <p>Ca metodă de antrenament, formele contribuie la dezvoltarea unor calități:</p>
            <ul className="flex flex-col gap-2 pl-5">
              {FORM_TRAINING_QUALITIES.map((item) => (
                <li key={item} className="list-disc marker:text-[#edb654]">{item}</li>
              ))}
            </ul>

            <p>Ca probă competițională, în arbitrarea probelor de forme se urmărește:</p>
            <ul className="flex flex-col gap-2 pl-5">
              {FORM_JUDGING_CRITERIA.map((item) => (
                <li key={item} className="list-disc marker:text-[#edb654]">{item}</li>
              ))}
            </ul>

            <p>
              Se spune că cea mai bună pregătire pentru lupta liberă este antrenamentul formelor, și că cea mai
              bună pregătire pentru înțelegerea și execuția corectă a formelor este lupta liberă. Aici se ascunde
              un sens adânc pe care doar practicând îl putem înțelege.
            </p>
            <p>
              Acest principiu ne sugerează că pentru a fi eficient și împlinit din punct de vedere marțial,
              practicantul trebuie să fie complet, practicant pasionat atât al luptei libere cât și a formelor și
              de aceea, în stilurile tradiționale, ideea că un practicant poate favoriza una dintre laturi în
              detrimentul celeilalte invocând principiul specializării nu este considerată ca fiind acceptabilă.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
