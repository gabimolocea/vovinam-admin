// Shared between CompetitionCentralizator.jsx and AdminCentralizatorMatrix.jsx -
// kept in its own module (not exported from the page) to avoid a circular
// import between the page and the component it renders.
export const GENDER_LABELS = { male: 'MASCULIN', female: 'FEMININ', mixt: 'MIXT' };
export const GENDER_BG     = { male: 'bg-blue-500/10', female: 'bg-pink-500/10', mixt: 'bg-amber-500/10' };
export const TYPE_LABELS   = { solo: 'Solo', team: 'Echipă', teams: 'Echipă', fight: 'Luptă' };
export const isTeamCategoryType = (type) => type === 'team' || type === 'teams';

// Parses a weight-bracket category name like "-30kg" or "+95kg" into its
// sign/bound. Shared by AdminLuptaSheet (weight → suggested bracket) and
// the coach "Adaugă sportiv" flow (weight → the actual enrolled bracket).
export function parseWeightBound(name) {
  const m = name.match(/([+-])\s*(\d+(?:\.\d+)?)\s*kg/i);
  if (!m) return null;
  return { sign: m[1], value: parseFloat(m[2]) };
}

export function suggestCategory(weight, catsInGroupGender) {
  if (weight == null || Number.isNaN(weight)) return null;
  let plusFallback = null;
  for (const cat of catsInGroupGender) {
    const bound = parseWeightBound(cat.name);
    if (!bound) continue;
    if (bound.sign === '-' && weight <= bound.value) return cat;
    if (bound.sign === '+') plusFallback = cat;
  }
  return plusFallback;
}

// Finds every Group whose birth-date/year range contains the athlete's
// date of birth, in the given groups' order - birth_date_start/end takes
// priority over birth_year_start/end when set, matching the backend's own
// Group.eligibility_warnings() logic (backend/api/models/core.py). Empty
// array if none match (or the athlete has no recorded date of birth).
//
// A group with BOTH bounds set is a normal [start, end] window (start =
// earliest/oldest birth date or year allowed, end = latest/youngest).
// A group with only ONE bound set is an open-ended "Seniors" bracket, e.g.
// "Sen. Gr. Mari (2008+)" (birth_year_start=2008, no end) - per the "+"
// naming convention (also used by Group.__str__ on the backend), that
// means "this age or older", i.e. born THAT year/date or *earlier* -
// the opposite inequality direction from how the same field behaves when
// paired with an end bound. Only-end-set groups ("up to {end}") already
// mean "born that year/date or earlier" either way, so both single-bound
// cases resolve to the same "dob <= bound" check.
//
// More than one group can plausibly match (e.g. two same-range "Seniors"
// sub-groups that split by something other than age) - callers that need
// to enroll into a specific category should try each candidate in turn
// and use the first one that actually has a matching category, rather
// than assuming the first age-match is always the right group.
export function findMatchingGroups(dateOfBirth, groups) {
  if (!dateOfBirth) return [];
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return [];
  const dobYear = dob.getFullYear();

  const matches = [];
  for (const group of groups) {
    if (group.birth_date_start || group.birth_date_end) {
      const start = group.birth_date_start ? new Date(group.birth_date_start) : null;
      const end = group.birth_date_end ? new Date(group.birth_date_end) : null;
      if (start && end) {
        if (dob >= start && dob <= end) matches.push(group);
      } else if (start) {
        if (dob <= start) matches.push(group);
      } else if (end) {
        if (dob <= end) matches.push(group);
      }
      continue;
    }
    if (group.birth_year_start || group.birth_year_end) {
      const start = group.birth_year_start;
      const end = group.birth_year_end;
      if (start && end) {
        if (dobYear >= start && dobYear <= end) matches.push(group);
      } else if (start) {
        if (dobYear <= start) matches.push(group);
      } else if (end) {
        if (dobYear <= end) matches.push(group);
      }
    }
  }
  return matches;
}

export function findMatchingGroup(dateOfBirth, groups) {
  return findMatchingGroups(dateOfBirth, groups)[0] ?? null;
}
