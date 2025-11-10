(function(){
  'use strict';

  function getCentralRefereeId() {
    // Find the first penalty inline row with a referee selected and use that as central referee
    var refereeSelects = document.querySelectorAll("select[name$='-referee']");
    for (var i = 0; i < refereeSelects.length; i++) {
      var sel = refereeSelects[i];
      if (!sel.closest) continue;
      // Only consider selects inside a RefereePointEvent inline row: look for sibling field 'side' or 'points'
      var row = sel.closest('tr') || sel.closest('.inline-related');
      if (!row) continue;
      // check if this row contains a side select or points input (penalty inline)
      var side = row.querySelector("select[name$='-side']");
      var pts = row.querySelector("input[name$='-points']");
      if (side && pts && sel.value) {
        return sel.value;
      }
    }
    // Fallbacks: if no inline referee selected, try to read a top-level central referee
    // hidden input (if the admin form includes it), or pick any referee value from
    // penalty inlines even if it's not inside the same row structure.
    try {
      var top = document.querySelector('#id_central_referee') || document.querySelector('input[name="central_referee"]');
      if (top && top.value) return top.value;
    } catch (e) {}

    // As a last resort, return the first non-empty referee select value anywhere on page
    for (var j = 0; j < refereeSelects.length; j++) {
      if (refereeSelects[j].value) return refereeSelects[j].value;
    }

    return null;
  }

  function computeCentralPenalties(centralId) {
    var penalties = { red: 0, blue: 0 };
    if (!centralId) return penalties;
    var sideSelects = document.querySelectorAll("select[name$='-side']");
    for (var i = 0; i < sideSelects.length; i++) {
      var sideSel = sideSelects[i];
      var row = sideSel.closest('tr') || sideSel.closest('.inline-related');
      if (!row) continue;
      var refSel = row.querySelector("select[name$='-referee']");
      var ptsInput = row.querySelector("input[name$='-points']");
      if (!refSel || !ptsInput) continue;
      if (refSel.value !== centralId) continue;
      var pts = parseFloat(ptsInput.value) || 0;
      var side = sideSel.value;
      if (side === 'red' || side === 'blue') penalties[side] += pts;
    }
    return penalties;
  }

  function recomputeAll() {
    try {
      var central = getCentralRefereeId();
      var penalties = computeCentralPenalties(central);

      // Find all red inputs that belong to referee score inline rows.
      var redInputs = document.querySelectorAll("input[name$='-red_corner_score']");
      for (var i = 0; i < redInputs.length; i++) {
        var rInput = redInputs[i];
        var namePrefixMatch = rInput.name.match(/^(.*)-red_corner_score$/);
        if (!namePrefixMatch) continue;
        var prefix = namePrefixMatch[1];
        var bInput = document.querySelector("input[name='" + prefix + "-blue_corner_score']");
        if (!bInput) continue;
        var red = parseFloat(rInput.value) || 0;
        var blue = parseFloat(bInput.value) || 0;
        var adjRed = red - (penalties.red || 0);
        var adjBlue = blue - (penalties.blue || 0);
        var row = rInput.closest('tr') || rInput.closest('.inline-related');
        if (!row) continue;
        var cell = row.querySelector('.field-winner_display');
        if (!cell) {
          // fallback: try to find any td with text placeholder
          var tds = row.querySelectorAll('td');
          for (var k = 0; k < tds.length; k++) {
            if (tds[k].className && tds[k].className.indexOf('field-winner_display') !== -1) { cell = tds[k]; break; }
          }
        }
        var text = '';
        if (adjRed > adjBlue) text = 'Red';
        else if (adjBlue > adjRed) text = 'Blue';
        else text = '';
        if (cell) {
          // Avoid touching input elements; find or create a small span to host the
          // computed winner so we don't accidentally clear or overwrite other
          // inline controls.
          if (cell.tagName && cell.tagName.toLowerCase() === 'input') {
            // Unexpected: don't modify input elements
          } else {
            var out = cell.querySelector('.computed-winner');
            if (!out) {
              out = document.createElement('span');
              out.className = 'computed-winner';
              out.style.fontWeight = '600';
              out.style.marginLeft = '6px';
              // If the cell already contains text from the server, keep it and append
              cell.appendChild(out);
            }
            out.textContent = text;
          }
        }

        // Also update stored winner display cell if present (read-only field)
        var storedCell = row.querySelector('.field-winner_stored');
        if (storedCell) {
          // find the hidden input that stores stored winner? The stored winner is displayed from server; keep as-is.
          // Do nothing here; leaving stored value unchanged until server persists.
        }
      }
    } catch (err) {
      // swallow errors to avoid breaking admin
      console.error('referee_inline_winner error', err);
    }
  }

  // Debounce
  var timer = null;
  function scheduleRecompute() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(recomputeAll, 150);
  }

  document.addEventListener('change', function(e){
    var t = e.target;
    if (!t) return;
    if (/(red_corner_score|blue_corner_score|points|side|referee)$/.test(t.name)) {
      scheduleRecompute();
    }
  });

  window.addEventListener('load', function(){ setTimeout(recomputeAll, 200); });
})();
