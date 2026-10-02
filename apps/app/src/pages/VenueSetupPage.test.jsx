import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import VenueSetupPage from './VenueSetupPage.jsx';

/**
 * Pagina e doar text, dar e text pe care cineva il urmeaza pas cu pas intr-o
 * sala de concurs, fara sa aiba pe cine intreba. Testele de aici pazesc
 * lucrurile care, daca dispar dintr-o editare, lasa omul blocat: numele
 * containerelor pe care trebuie sa le recunoasca in Docker, porturile pe
 * care le tasteaza pe tablete, si avertismentul despre "client isolation" -
 * singura setare de router care face ca totul sa para pornit si sa nu
 * mearga nimic.
 *
 * De cand pagina e impartita pe ecrane, fiecare test spune de la inceput pe
 * care se uita: `deschide('adrese')`. Asta e si o verificare in sine - daca
 * un ecran se redenumeste, testele lui pica imediat, nu peste trei luni.
 */

// Ecranul se cere din adresa, ca in aplicatie. MemoryRouter fiindca pagina
// citeste si scrie parametrul `p`.
function deschide(ecran) {
  return render(
    <MemoryRouter initialEntries={[ecran ? `/?p=${ecran}` : '/']}>
      <VenueSetupPage />
    </MemoryRouter>,
  );
}

const TOATE_ECRANELE = [
  'start', 'docker', 'descarca', 'deschide', 'pornire', 'retea', 'gata',
  'verifica', 'adrese', 'panou', 'probleme',
];

const RELEASE = {
  disponibil: true,
  versiune: 'v1.2.0',
  publicat_la: '2026-10-01T18:00:00Z',
  pagina_release: 'https://github.com/x/releases/tag/v1.2.0',
  fisiere: [
    { cheie: 'mac-arm64', sistem: 'mac', eticheta: 'Mac cu procesor Apple', detaliu: 'M1, M2, M3, M4', nume: 'a.dmg', marime_mb: 96.9, url: 'https://github.com/x/a.dmg' },
    { cheie: 'mac-intel', sistem: 'mac', eticheta: 'Mac cu procesor Intel', detaliu: 'mai vechi', nume: 'b.dmg', marime_mb: 101.3, url: 'https://github.com/x/b.dmg' },
    { cheie: 'windows', sistem: 'windows', eticheta: 'Windows', detaliu: 'Windows 10 sau 11', nume: 'c.exe', marime_mb: 95.0, url: 'https://github.com/x/c.exe' },
  ],
};

describe('Drumul prin pagina', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('neintrebat'))));
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('incepe cu ce avem de facut, nu cu primul pas', () => {
    deschide();
    expect(screen.getByRole('heading', { name: /Ce avem de făcut/i })).toBeInTheDocument();
    // Fara numar de pas pe ecranul de intrare: inca n-a inceput nimic.
    expect(screen.queryByText(/Pasul \d din/)).not.toBeInTheDocument();
  });

  it('merge mai departe prin asistent si numara pasii', () => {
    deschide();
    fireEvent.click(screen.getByRole('button', { name: /Începe instalarea/ }));
    expect(screen.getByRole('heading', { name: /Instalează Docker Desktop/ })).toBeInTheDocument();
    expect(screen.getByText('Pasul 1 din 5')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Următorul/ }));
    expect(screen.getByText('Pasul 2 din 5')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Înapoi/ }));
    expect(screen.getByText('Pasul 1 din 5')).toBeInTheDocument();
  });

  it('deschide referinta direct de la adresa ei', () => {
    // Tot rostul impartirii: in ziua competitiei omul deschide „adrese”
    // dintr-un favorit, nu trece prin cinci pasi de instalare.
    deschide('adrese');
    expect(screen.getByRole('heading', { name: /Adresele din sală/ })).toBeInTheDocument();
    expect(screen.queryByText(/Pasul \d din/)).not.toBeInTheDocument();
  });

  it('tine referinta la vedere de pe orice ecran', () => {
    for (const ecran of ['start', 'docker', 'probleme']) {
      const { unmount } = deschide(ecran);
      expect(screen.getByRole('button', { name: /Când ceva nu merge/ })).toBeInTheDocument();
      unmount();
    }
  });

  it('se intoarce la inceput cand adresa cere un ecran inexistent', () => {
    deschide('ecran-care-nu-exista');
    expect(screen.getByRole('heading', { name: /Ce avem de făcut/i })).toBeInTheDocument();
  });
});

describe('Descarcarea launcherului', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  function cuRaspuns(date) {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(date) })));
  }

  it('arata ambele feluri de Mac, cu marimea fiecaruia', async () => {
    cuRaspuns(RELEASE);
    deschide('descarca');

    await waitFor(() => expect(screen.getByText(/Mac cu procesor Apple/)).toBeInTheDocument());
    expect(screen.getByText(/Mac cu procesor Intel/)).toBeInTheDocument();
    expect(screen.getByText(/96.9 MB/)).toBeInTheDocument();
    // Windows e pe celalalt tab, nu trebuie sa apara acum.
    expect(screen.queryByText(/Windows 10 sau 11/)).not.toBeInTheDocument();
  });

  it('duce la adresa noastra, nu la GitHub', async () => {
    cuRaspuns(RELEASE);
    deschide('descarca');

    const buton = await screen.findByRole('link', { name: /Mac cu procesor Apple/ });
    // Tot rostul schimbarii: butonul da fisierul, nu trimite omul pe o
    // pagina GitHub unde ar trebui sa aleaga singur dintre cinci fisiere.
    expect(buton.getAttribute('href')).toContain('/public/launcher/download/mac-arm64/');
    expect(buton.getAttribute('href')).not.toContain('github.com');
  });

  it('spune ce se intampla la versiunile urmatoare, diferit pe fiecare sistem', async () => {
    cuRaspuns(RELEASE);
    deschide('descarca');

    // Pe Windows se actualizeaza singura; pe Mac nu se poate fara certificat,
    // si omul trebuie sa stie dinainte, nu sa descopere in ziua competitiei.
    await waitFor(() => expect(screen.getByText(/deschide pagina de descarcare/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('tab', { name: /Windows/ }));
    expect(screen.getByText(/le descarcă singură/)).toBeInTheDocument();
  });

  it('arata ce versiune e, ca sa se vada daca e la zi', async () => {
    cuRaspuns(RELEASE);
    deschide('descarca');
    await waitFor(() => expect(screen.getByText(/Versiunea v1.2.0/)).toBeInTheDocument());
  });

  it('ramane folosibila cand serverul nu raspunde', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('fara retea'))));
    deschide('descarca');

    // Fara versiune, pagina tot trebuie sa ofere o cale - altfel cel care
    // pregateste laptopul ramane blocat exact la pasul de descarcare.
    const rezerva = await screen.findByRole('link', { name: /pagina de versiuni/i });
    expect(rezerva.getAttribute('href')).toContain('releases');
  });

  it('spune ce fisier sa caute manual, pe fiecare sistem', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('fara retea'))));
    deschide('descarca');

    await waitFor(() => expect(screen.getByText('.dmg')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('tab', { name: /Windows/ }));
    expect(screen.getByText('.exe')).toBeInTheDocument();
  });
});

describe('Ce nu are voie sa dispara', () => {
  beforeEach(() => {
    // Testele astea nu sunt despre descarcare: raspuns respins, ca sa nu
    // ramana cereri de retea nemanipulate in jsdom.
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('neintrebat'))));
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('numeste toate cele patru containere care trebuie sa apara in Docker', () => {
    deschide('verifica');
    for (const nume of ['db', 'backend', 'frontends', 'backup-scheduler']) {
      // getAllByText: numele apare si in desenul ferestrei Docker, si in
      // fisa de dedesubt. Asta e intentionat - desenul arata unde se uita,
      // fisa spune ce e - deci cerem doar sa existe, nu sa fie unic.
      expect(screen.getAllByText(nume).length).toBeGreaterThan(0);
    }
  });

  it('explica ce tine fiecare volum, ca sa nu fie sters vreunul', () => {
    deschide('verifica');
    for (const volum of ['frvv_local_db_data', 'frvv_local_media', 'frvv_local_backups']) {
      expect(screen.getByText(volum)).toBeInTheDocument();
    }
  });

  it('da porturile exacte pe care le folosesc dispozitivele din sala', () => {
    deschide('adrese');
    // Aceleasi cu cele din apps/launcher/electron/services.js - daca se
    // schimba acolo, trebuie schimbate si aici.
    for (const port of ['5191', '5176', '5177']) {
      expect(screen.getByText(new RegExp(`:${port}$`))).toBeInTheDocument();
    }
  });

  it('cere doar Docker si aplicatia, nu si Node sau codul sursa', () => {
    deschide('docker');
    expect(screen.getByRole('heading', { name: /Instalează Docker Desktop/ })).toBeInTheDocument();
    deschide('descarca');
    expect(screen.getByRole('heading', { name: /Descarcă aplicația federației/ })).toBeInTheDocument();
  });

  it('nu cere Node sau npm pe niciun ecran', () => {
    // Tot rostul stivei cu imagini gata facute: pe laptopul din sala nu se
    // mai instaleaza Node si nu se mai descarca depozitul. Cautam pe toate
    // ecranele, fiindca acum un pas dat inapoi s-ar putea ascunde pe unul
    // la care nimeni nu se uita.
    for (const ecran of TOATE_ECRANELE) {
      const { unmount } = deschide(ecran);
      expect(screen.queryByText(/Node\.js/)).not.toBeInTheDocument();
      expect(screen.queryByText(/npm install/)).not.toBeInTheDocument();
      unmount();
    }
  });

  it('spune cum se deschide o aplicatie nesemnata, pe fiecare sistem', () => {
    deschide('deschide');
    // Implicit e Mac.
    expect(screen.getByText(/clic dreapta/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Windows/ }));
    expect(screen.getByText(/Run anyway/)).toBeInTheDocument();
    expect(screen.queryByText(/clic dreapta/i)).not.toBeInTheDocument();
  });

  it('avertizeaza despre client isolation, capcana care nu da niciun semn', () => {
    deschide('retea');
    // Si in desenul routerului, si in lista de sub el.
    expect(screen.getAllByText(/client isolation/i).length).toBeGreaterThan(0);
  });

  it('spune ce sa faci cand autentificarea da eroarea cu metoda GET', () => {
    deschide('probleme');
    expect(screen.getByText(/Metoda GET nu este permisă/)).toBeInTheDocument();
  });
});
