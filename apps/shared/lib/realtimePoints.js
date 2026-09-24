// Punctele validate, numarate pe FAZE, nu pe evenimente.
//
// O faza confirmata de doi arbitri produce doua randuri in baza - unul
// de la fiecare. Cine le aduna pur si simplu vede dublu: doi arbitri de
// acord pe un +2 dau 4. Numarul asta e cel dupa care se dau medaliile,
// deci exista o singura implementare, folosita si de ecranul public si
// de panoul de operare. Cand traia in doua locuri, a si deviat.
//
// Gruparea urmeaza aceeasi regula ca serverul
// (_auto_validate_real_time_point_event): aceeasi repriza, aceeasi
// parte, aceeasi valoare, la mai putin de 1500 ms distanta. O faza intra
// in scor doar daca au confirmat-o cel putin doi arbitri.

export const REAL_TIME_POINT_VALIDATION_WINDOW_MS = 1500;

export function getRealtimePointRoundKey(event) {
  const metadata = event?.metadata || {};
  return metadata.round_id || metadata.round || 'unassigned';
}

export function getRealtimePointComparisonTimestamp(event) {
  const metadata = event?.metadata || {};
  const clientTimestamp = Number(metadata.client_timestamp_ms);
  if (Number.isFinite(clientTimestamp)) return clientTimestamp;
  const serverTimestamp = new Date(event?.timestamp || 0).getTime();
  return Number.isFinite(serverTimestamp) ? serverTimestamp : 0;
}

export function aggregateRealtimeValidatedPoints(pointEvents) {
  const groupedEvents = new Map();

  (pointEvents || [])
    .filter((event) => event && event.validation_status === 'validated' && event.event_type !== 'penalty')
    .sort((a, b) => {
      const timeA = getRealtimePointComparisonTimestamp(a);
      const timeB = getRealtimePointComparisonTimestamp(b);
      if (timeA !== timeB) return timeA - timeB;
      return (a.id || 0) - (b.id || 0);
    })
    .forEach((event) => {
      const groupKey = [
        getRealtimePointRoundKey(event),
        event.side || 'red',
        Number(event.points || 0),
        event.event_type || 'score',
      ].join('|');
      const currentGroups = groupedEvents.get(groupKey) || [];
      const eventTimestamp = getRealtimePointComparisonTimestamp(event);
      const lastGroup = currentGroups[currentGroups.length - 1];

      if (!lastGroup || eventTimestamp - lastGroup.anchorTimestamp >= REAL_TIME_POINT_VALIDATION_WINDOW_MS) {
        currentGroups.push({
          anchorTimestamp: eventTimestamp,
          events: [event],
          refereeIds: new Set(event.referee ? [event.referee] : []),
        });
      } else {
        lastGroup.events.push(event);
        if (event.referee) {
          lastGroup.refereeIds.add(event.referee);
        }
      }

      groupedEvents.set(groupKey, currentGroups);
    });

  let red = 0;
  let blue = 0;

  groupedEvents.forEach((groups) => {
    groups.forEach((group) => {
      if (group.refereeIds.size < 2 || !group.events.length) return;
      const awardedEvent = group.events[0];
      const awardedPoints = Number(awardedEvent.points || 0);
      if (awardedEvent.side === 'blue') {
        blue += awardedPoints;
      } else {
        red += awardedPoints;
      }
    });
  });

  return { red, blue };
}
