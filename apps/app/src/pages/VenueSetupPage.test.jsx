import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import VenueSetupPage from './VenueSetupPage.jsx';

/**
 * Pagina e doar text, dar e text pe care cineva il urmeaza pas cu pas intr-o
 * sala de concurs, fara sa aiba pe cine intreba. Testele de aici pazesc
 * lucrurile care, daca dispar dintr-o editare, lasa omul blocat: numele
 * containerelor pe care trebuie sa le recunoasca in Docker, porturile pe
 * care le tasteaza pe tablete, si avertismentul despre "client isolation" -
 * singura setare de router care face ca totul sa para pornit si sa nu
 * mearga nimic.
 */
describe('VenueSetupPage', () => {
  it('numeste toate cele patru containere care trebuie sa apara in Docker', () => {
    render(<VenueSetupPage />);
    for (const nume of ['db', 'backend', 'frontends', 'backup-scheduler']) {
      // getAllByText, nu getByText: `backend` apare si in fisa containerului,
      // si mai jos la depanare, unde se spune ce faci daca pica.
      expect(screen.getAllByText(nume).length).toBeGreaterThan(0);
    }
  });

  it('explica ce tine fiecare volum, ca sa nu fie sters vreunul', () => {
    render(<VenueSetupPage />);
    for (const volum of ['frvv_local_db_data', 'frvv_local_media', 'frvv_local_backups']) {
      expect(screen.getByText(volum)).toBeInTheDocument();
    }
  });

  it('da porturile exacte pe care le folosesc dispozitivele din sala', () => {
    render(<VenueSetupPage />);
    // Aceleasi cu cele din apps/launcher/electron/services.js - daca se
    // schimba acolo, trebuie schimbate si aici.
    for (const port of ['5191', '5176', '5177']) {
      expect(screen.getByText(new RegExp(`:${port}$`))).toBeInTheDocument();
    }
  });

  it('cere doar Docker si aplicatia, nu si Node sau codul sursa', () => {
    render(<VenueSetupPage />);
    expect(screen.getByText(/Instalează Docker Desktop/)).toBeInTheDocument();
    expect(screen.getByText(/Descarcă aplicația federației/)).toBeInTheDocument();
    // Tot rostul stivei cu imagini gata facute: pe laptopul din sala nu se
    // mai instaleaza Node si nu se mai descarca depozitul. Daca pasii aia
    // reapar in pagina, inseamna ca cineva a dat inapoi fara sa vrea.
    expect(screen.queryByText(/Node\.js/)).not.toBeInTheDocument();
    expect(screen.queryByText(/npm install/)).not.toBeInTheDocument();
  });

  it('spune cum se deschide o aplicatie nesemnata, pe fiecare sistem', () => {
    render(<VenueSetupPage />);
    // Implicit e Mac.
    expect(screen.getByText(/clic dreapta/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Windows/ }));
    expect(screen.getByText(/Run anyway/)).toBeInTheDocument();
    expect(screen.queryByText(/clic dreapta/i)).not.toBeInTheDocument();
  });

  it('avertizeaza despre client isolation, capcana care nu da niciun semn', () => {
    render(<VenueSetupPage />);
    expect(screen.getAllByText(/client isolation/i).length).toBeGreaterThan(0);
  });

  it('spune ce sa faci cand autentificarea da eroarea cu metoda GET', () => {
    render(<VenueSetupPage />);
    expect(screen.getByText(/Metoda GET nu este permisă/)).toBeInTheDocument();
  });
});
