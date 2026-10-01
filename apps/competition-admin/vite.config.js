import { createAppViteConfig } from '../shared/vite.base.js';

// `proxyMedia` pornit si `/admin` adaugat: cand aplicatia e deschisa de pe
// alt dispozitiv, tot ce cere trece prin portul ei, iar serverul de
// dezvoltare duce mai departe catre Django pe masina asta. Altfel
// dispozitivul ar trebui sa ajunga el insusi la portul 8000 - ceea ce
// depinde de firewall-ul laptopului si de retea.
export default createAppViteConfig({
  port: 5173,
  extraProxy: { '/admin': 'http://localhost:8000', '/static': 'http://localhost:8000' },
});
