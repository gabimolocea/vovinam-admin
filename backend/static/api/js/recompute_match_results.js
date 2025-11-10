(function(){
  // Small admin helper to add a "Recompute results" button on Match change page.
  // When clicked it POSTs to the recompute-results admin view and reloads on success.
  function getMatchIdFromUrl() {
    // Expect URL like /admin/api/match/<id>/change/
    var m = window.location.pathname.match(/\/admin\/api\/match\/(\d+)\/(?:change|)$/);
    if (m) return m[1];
    // fallback: try to find object_id input
    var obj = document.querySelector('input[name="object_id"]');
    if (obj) return obj.value;
    return null;
  }

  function csrftoken() {
    var el = document.querySelector('input[name="csrfmiddlewaretoken"]');
    return el ? el.value : null;
  }

  function showMessage(msg, isError) {
    var container = document.querySelector('#content-main') || document.body;
    var el = document.createElement('div');
    el.style.margin = '10px 0';
    el.style.padding = '10px';
    el.style.borderRadius = '3px';
    el.style.fontWeight = '600';
    el.style.background = isError ? '#ffdddd' : '#ddffdd';
    el.style.color = isError ? '#900' : '#060';
    el.textContent = msg;
    container.insertBefore(el, container.firstChild);
    setTimeout(function(){ try{ el.parentNode.removeChild(el);}catch(e){} }, 4000);
  }

  document.addEventListener('DOMContentLoaded', function(){
    var matchId = getMatchIdFromUrl();
    if (!matchId) return;

    // Insert button into the object-tools area if present, otherwise near the save buttons
    var tools = document.querySelector('.object-tools');
    var btn = document.createElement('a');
    btn.className = 'button';
    btn.id = 'recompute-results-btn';
    btn.href = '#';
    btn.style.marginLeft = '8px';
    btn.textContent = 'Recompute results';

    var attachTo = tools || document.querySelector('.submit-row') || document.querySelector('#content-main');
    if (attachTo) {
      attachTo.insertBefore(btn, attachTo.firstChild);
    }

    btn.addEventListener('click', function(ev){
      ev.preventDefault();
      if (!confirm('Recompute and persist referee winners for this match now?')) return;
      var url = window.location.pathname.replace(/change\/?$/, '') + 'recompute-results/';
      // If URL ends with a slash and already contains recompute-results, adjust
      if (!/recompute-results\/$/.test(url)) {
        if (!url.endsWith('/')) url += '/';
        url = url + 'recompute-results/';
      }
      // Ensure we build a sane path: admin urls are like /admin/api/match/<id>/change/
      // So construct /admin/api/match/<id>/recompute-results/
      var m = window.location.pathname.match(/(\/admin\/api\/match\/\d+)\//);
      if (m) url = m[1] + '/recompute-results/';

      var token = csrftoken();
      if (!token) { showMessage('CSRF token not found. Cannot perform request.', true); return; }

      btn.textContent = 'Recomputing...';
      btn.disabled = true;

      fetch(url, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'X-CSRFToken': token,
          'X-Requested-With': 'XMLHttpRequest',
          'Accept': 'application/json'
        }
      }).then(function(resp){
        if (!resp.ok) throw resp;
        return resp.json();
      }).then(function(data){
        if (data && data.ok) {
          showMessage('Recompute succeeded. Refreshing to show updated winners...');
          setTimeout(function(){ window.location.reload(); }, 800);
        } else {
          showMessage('Recompute failed: ' + (data && data.error ? data.error : 'unknown'), true);
          btn.textContent = 'Recompute results';
          btn.disabled = false;
        }
      }).catch(function(err){
        if (err && typeof err.json === 'function') {
          err.json().then(function(j){ showMessage('Error: ' + (j.error || 'Server error'), true); });
        } else {
          showMessage('Server error while recomputing results', true);
        }
        btn.textContent = 'Recompute results';
        btn.disabled = false;
      });
    });
  });
})();
