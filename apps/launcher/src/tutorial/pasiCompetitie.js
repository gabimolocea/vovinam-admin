/**
 * Pasii ghidului interactiv pentru Panoul Competitie.
 *
 * E doar o lista: fiecare pas spune pe ce fila duce ghidul operatorul si ce
 * incercuieste acolo. Ordinea e cea din bara aplicatiei, care e si ordinea
 * fireasca a zilei - intai cine concureaza, apoi cum se desfasoara, apoi ce
 * se intampla in timpul zilei si la final.
 *
 * `fila` se cauta dupa textul tab-ului din bara de jos a aplicatiei
 * (apps/competition-admin, CategoriesLayout.jsx). `tinta` e textul exact al
 * elementului de incercuit; daca lipseste, se incercuieste chiar tab-ul -
 * ceea ce e de ajuns cand pasul spune "uite unde se face lucrul asta".
 *
 * Daca in aplicatie se schimba o eticheta, pasul nu mai gaseste nimic si
 * panoul o spune pe fata, in loc sa para ca a mers (vezi TutorialPanel).
 */
export const FAZE_TUTORIAL = [
  { nume: 'Înainte: cine concurează', de_la: 1 },
  { nume: 'Apoi: cum se desfășoară', de_la: 4 },
  { nume: 'În timpul zilei și la final', de_la: 7 },
];

const PASI = [
  {
    fila: 'CENTRALIZATOR',
    titlu: 'Centralizator — înscrii sportivii',
    text: 'Tabloul mare: cluburile pe rânduri, categoriile pe coloane. Apeși în celulă ca să înscrii un sportiv la o categorie. Pe ultimul rând vezi câți participanți are fiecare categorie.',
  },
  {
    fila: 'TEHNICA',
    titlu: 'Tehnica — proba cu proba',
    text: 'Același lucru, dar pe cartonașe: câte unul pentru fiecare probă tehnică — grupă, probă, gen. Aici se văd cel mai bine categoriile încă goale. Echipele de Sincron tot de aici se adaugă.',
  },
  {
    fila: 'LUPTA',
    titlu: 'Lupta — cântarul',
    text: 'Toți sportivii înscriși la luptă, cu greutatea de la cântar. Aplicația îți sugerează categoria după greutate, dar categoria finală o alegi tu, pe fiecare rând.',
  },
  {
    fila: 'PIRAMIDE',
    titlu: 'Piramide — arborii de meciuri',
    text: 'Fiecare categorie de luptă se desface într-un arbore de meciuri. De aici se tipăresc, sau se scot în Excel, ca să le ai și pe hârtie la masa de arbitraj.',
  },
  {
    fila: 'PROGRAMARE',
    titlu: 'Programare — ce intră pe ce teren',
    text: 'Întâi spui câte terenuri ai, apoi distribui categoriile pe ele, cu ora de start și durata. Butoanele „Mută categorii automat” și „Asignează arbitri automat” fac prima variantă în locul tău; o ajustezi după.',
    tinta: 'TERENURI',
  },
  {
    fila: 'ARBITRI',
    titlu: 'Arbitri — cine e în sală',
    text: 'Lista arbitrilor prezenți și rolul delegat al fiecăruia; de aici iese și foaia de delegare în PDF. Atenție: alocarea pe probe nu se face aici, ci în Programare.',
    tinta: 'Adaugă arbitru',
  },
  {
    fila: 'LIVE',
    titlu: 'Live — ce se întâmplă acum',
    text: 'Pe fiecare teren, ce probă e în curs și ce s-a finalizat. Ăsta e ecranul pe care îl ții deschis în timpul competiției.',
  },
  {
    fila: 'CLASAMENT',
    titlu: 'Clasament — rezultatele',
    text: 'Patru clasamente, pe sub-file: tehnica, lupta, cluburi și sportivi înscriși. Se completează pe măsură ce intră rezultatele.',
  },
  {
    fila: 'DIPLOME',
    titlu: 'Diplome — la final',
    text: 'Șabloanele de diplomă, pe locuri — 1, 2, 3 și participare — separat pentru solo, echipă și luptă. Se încarcă un PDF peste care aplicația scrie numele.',
  },
];

export default PASI;
