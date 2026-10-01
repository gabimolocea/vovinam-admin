#!/usr/bin/env node
/**
 * Verifica faptul de care depinde tot: launcherul trebuie sa porneasca si
 * acolo unde nu exista cod sursa.
 *
 * Exista fiindca v1.0.0 a fost publicata rupta exact asa. Pe laptopul din
 * sala nu e descarcat depozitul - stiva vine ca imagini gata facute - iar
 * launcherul arunca "Nu stiu unde este proiectul pe acest calculator" chiar
 * la pornire. Pe calculatorul oricarui dezvoltator nu se vede niciodata,
 * fiindca acolo codul e mereu la locul lui.
 *
 * Verificarea copiaza electron/ intr-un folder temporar din afara
 * depozitului - asa, deducerea caii din locul fisierului esueaza, exact ca
 * intr-o aplicatie instalata - si cere lista de servicii pentru modul din
 * sala.
 */

import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const radacina = join(dirname(fileURLToPath(import.meta.url)), '..');
const temporar = mkdtempSync(join(tmpdir(), 'frvv-fara-depozit-'));

let iesire = 0;
try {
  cpSync(join(radacina, 'apps/launcher/electron'), join(temporar, 'electron'), { recursive: true });

  const cere = createRequire(pathToFileURL(join(temporar, 'nimic.js')));
  const { getRepoRoot } = cere('./electron/repoRoot.js');
  const { buildServiceDefs } = cere('./electron/services.js');

  if (getRepoRoot() !== null) {
    throw new Error(
      'Verificarea nu masoara ce trebuie: copia vede un depozit, desi nu ar trebui. '
      + `A gasit: ${getRepoRoot()}`,
    );
  }

  const servicii = buildServiceDefs('192.168.1.50', { useDocker: true, frontendsFromDocker: true });

  const asteptate = ['competition-admin', 'referee-scoring', 'public-display'];
  const primite = servicii.map((s) => s.id);
  if (asteptate.some((id) => !primite.includes(id))) {
    throw new Error(`Lipsesc interfete din lista: am primit ${primite.join(', ')}`);
  }
  if (servicii.some((s) => !s.managedByDocker)) {
    throw new Error('Fara cod pe disc, toate interfetele trebuie marcate ca pornite de Docker.');
  }
  if (servicii.some((s) => !s.port)) {
    throw new Error('Fiecare interfata are nevoie de port - de acolo ies adresele afisate in sala.');
  }

  console.log('✓ Launcherul da adresele si fara cod sursa pe disc.');
} catch (eroare) {
  console.error(`✗ ${eroare.message}`);
  console.error('\n  Asta inseamna ca aplicatia instalata pe laptopul din sala nu porneste.');
  iesire = 1;
} finally {
  rmSync(temporar, { recursive: true, force: true });
}

process.exit(iesire);
