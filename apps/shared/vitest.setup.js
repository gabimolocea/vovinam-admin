import '@testing-library/jest-dom/vitest';

// jsdom nu are derulare: orice `window.scrollTo` arunca "Not implemented" pe
// stderr, in mijlocul rezultatelor testelor. Nu e o defectiune a codului - o
// pagina care duce omul in varf dupa ce schimba ecranul face exact ce
// trebuie - doar ca jsdom n-are ce misca. Il inlocuim cu o functie goala, ca
// zgomotul sa nu ascunda avertismentele adevarate.
window.scrollTo = () => {};
