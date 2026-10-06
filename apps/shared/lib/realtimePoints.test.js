import { describe, it, expect } from 'vitest';
import { aggregateRealtimeValidatedPoints, ARBITRI_PENTRU_FAZA } from './realtimePoints';

// O fază confirmată de mai mulți arbitri produce câte un rând în baza de date
// de la fiecare. Adunate pur și simplu, dau de câteva ori mai mult — iar
// panoul de operare chiar afișa +4 pentru o fază de +2 confirmată de doi.
//
// Testele astea au fost scrise pe regula veche, de doi din cinci, și au rămas
// pe ea după ce regula s-a făcut trei: au căzut abia în CI, unde se vedeau
// alături de celelalte.
const point = (referee, atMs, { side = 'red', points = 1, round = 1 } = {}) => ({
  id: `${referee}-${atMs}-${side}-${points}`,
  referee,
  side,
  points,
  event_type: 'score',
  validation_status: 'validated',
  metadata: { round, client_timestamp_ms: 1_700_000_000_000 + atMs },
});

describe('aggregateRealtimeValidatedPoints', () => {
  it('cere trei arbitri pentru o fază', () => {
    expect(ARBITRI_PENTRU_FAZA).toBe(3);
  });

  it('numără o fază confirmată de trei arbitri o singură dată', () => {
    const totals = aggregateRealtimeValidatedPoints([
      point(1, 0, { points: 2 }),
      point(2, 300, { points: 2 }),
      point(3, 600, { points: 2 }),
    ]);
    expect(totals).toEqual({ red: 2, blue: 0 });
  });

  it('nu acordă nimic pentru un singur arbitru', () => {
    expect(aggregateRealtimeValidatedPoints([point(1, 0)])).toEqual({ red: 0, blue: 0 });
  });

  it('nu acordă nimic pentru doi arbitri, cât era regula veche', () => {
    const totals = aggregateRealtimeValidatedPoints([point(1, 0), point(2, 300)]);
    expect(totals).toEqual({ red: 0, blue: 0 });
  });

  it('numără două faze distincte separat', () => {
    // Doi pumni la două secunde: ambele confirmate, deci 2 puncte.
    const totals = aggregateRealtimeValidatedPoints([
      point(1, 0), point(2, 300), point(3, 600),
      point(1, 2000), point(2, 2300), point(3, 2600),
    ]);
    expect(totals).toEqual({ red: 2, blue: 0 });
  });

  it('nu dublează când același arbitru apasă de două ori pe aceeași fază', () => {
    const totals = aggregateRealtimeValidatedPoints([
      point(1, 0), point(1, 200), point(2, 300), point(3, 500),
    ]);
    expect(totals).toEqual({ red: 1, blue: 0 });
  });

  it('nu grupează colțuri diferite', () => {
    // Trei apăsări în aceeași clipă, dar nu pe același colț: nicăieri nu se
    // strâng trei pe același luptător.
    const totals = aggregateRealtimeValidatedPoints([
      point(1, 0, { side: 'red' }),
      point(2, 200, { side: 'blue' }),
      point(3, 400, { side: 'red' }),
    ]);
    expect(totals).toEqual({ red: 0, blue: 0 });
  });

  it('nu grupează apăsări mai depărtate decât fereastra de validare', () => {
    // Al treilea vine prea târziu: faza rămâne cu doi, deci fără puncte.
    const totals = aggregateRealtimeValidatedPoints([point(1, 0), point(2, 300), point(3, 1600)]);
    expect(totals).toEqual({ red: 0, blue: 0 });
  });

  it('ignoră evenimentele nevalidate', () => {
    const pending = { ...point(3, 500), validation_status: 'pending' };
    expect(aggregateRealtimeValidatedPoints([point(1, 0), point(2, 300), pending]))
      .toEqual({ red: 0, blue: 0 });
  });
});
