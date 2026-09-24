import { describe, it, expect } from 'vitest';
import { aggregateRealtimeValidatedPoints } from './realtimePoints';

// O fază confirmată de doi arbitri produce două rânduri în baza de date,
// unul de la fiecare. Adunate pur și simplu, dau dublu — iar panoul de
// operare chiar afișa +4 pentru o fază de +2 confirmată de doi arbitri.
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
  it('numără o fază confirmată de doi arbitri o singură dată', () => {
    const totals = aggregateRealtimeValidatedPoints([
      point(1, 0, { points: 2 }),
      point(2, 300, { points: 2 }),
    ]);
    expect(totals).toEqual({ red: 2, blue: 0 });
  });

  it('nu acordă nimic pentru un singur arbitru', () => {
    expect(aggregateRealtimeValidatedPoints([point(1, 0)])).toEqual({ red: 0, blue: 0 });
  });

  it('numără două faze distincte separat', () => {
    // Doi pumni la două secunde: ambele confirmate, deci 2 puncte.
    const totals = aggregateRealtimeValidatedPoints([
      point(1, 0), point(2, 300),
      point(1, 2000), point(2, 2300),
    ]);
    expect(totals).toEqual({ red: 2, blue: 0 });
  });

  it('nu dublează când același arbitru apasă de două ori pe aceeași fază', () => {
    const totals = aggregateRealtimeValidatedPoints([
      point(1, 0), point(1, 200), point(2, 300),
    ]);
    expect(totals).toEqual({ red: 1, blue: 0 });
  });

  it('nu grupează colțuri diferite', () => {
    const totals = aggregateRealtimeValidatedPoints([
      point(1, 0, { side: 'red' }),
      point(2, 200, { side: 'blue' }),
    ]);
    expect(totals).toEqual({ red: 0, blue: 0 });
  });

  it('nu grupează apăsări mai depărtate decât fereastra de validare', () => {
    const totals = aggregateRealtimeValidatedPoints([point(1, 0), point(2, 1600)]);
    expect(totals).toEqual({ red: 0, blue: 0 });
  });

  it('ignoră evenimentele nevalidate', () => {
    const pending = { ...point(2, 300), validation_status: 'pending' };
    expect(aggregateRealtimeValidatedPoints([point(1, 0), pending])).toEqual({ red: 0, blue: 0 });
  });
});
