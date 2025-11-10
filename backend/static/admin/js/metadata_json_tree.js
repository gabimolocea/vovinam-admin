document.addEventListener('DOMContentLoaded', function() {
  function parseMetadata(val) {
    if (!val) return {};
    try {
      return JSON.parse(val);
    } catch (e) {
      // Try a lenient replacement of single quotes -> double quotes for simple dicts
      try {
        return JSON.parse(String(val).replace(/'/g, '"'));
      } catch (e2) {
        return {};
      }
    }
  }

  function createCustomPair(key, value) {
    var wrapper = document.createElement('div');
    wrapper.className = 'json-meta-custom-pair';
    var k = document.createElement('input');
    k.type = 'text';
    k.className = 'json-meta-custom-key';
    k.placeholder = 'key';
    k.value = key || '';
    var v = document.createElement('input');
    v.type = 'text';
    v.className = 'json-meta-custom-value';
    v.placeholder = 'value';
    v.value = (value === undefined || value === null) ? '' : String(value);
    var del = document.createElement('button');
    del.type = 'button';
    del.className = 'json-meta-custom-del';
    del.textContent = 'Remove';
    del.addEventListener('click', function() { wrapper.remove(); updateHidden(); });
    wrapper.appendChild(k);
    wrapper.appendChild(v);
    wrapper.appendChild(del);
    // update on change
    k.addEventListener('change', updateHidden);
    v.addEventListener('change', updateHidden);
    return wrapper;
  }

  function updateHidden() {
    var cont = this.closest ? this.closest('.json-meta-editor') : null;
    if (!cont) {
      // fallback: find editor containers globally
      document.querySelectorAll('.json-meta-editor').forEach(function(c) { updateHiddenFor(c); });
    } else {
      updateHiddenFor(cont);
    }
  }

  function updateHiddenFor(container) {
    var hidden = container.querySelector('textarea.json-metadata-widget');
    if (!hidden) return;
    var out = {};
    var roundEl = container.querySelector('.json-meta-round');
    var centralEl = container.querySelector('.json-meta-central');
    var reasonEl = container.querySelector('.json-meta-reason');
    var originEl = container.querySelector('.json-meta-origin');
    if (roundEl && roundEl.value) out.round = Number(roundEl.value);
    if (centralEl && centralEl.checked) out.central = true;
    if (reasonEl && reasonEl.value) out.reason = reasonEl.value;
    if (originEl && originEl.value) out.origin = originEl.value;
    // custom pairs
    var customs = container.querySelectorAll('.json-meta-custom-pair');
    customs.forEach(function(p) {
      var k = p.querySelector('.json-meta-custom-key');
      var v = p.querySelector('.json-meta-custom-value');
      if (k && k.value) {
        // try to coerce numbers
        var val = v.value;
        if (val === '') {
          out[k.value] = '';
        } else if (!isNaN(val) && String(Number(val)) === val) {
          out[k.value] = Number(val);
        } else if (val === 'true' || val === 'false') {
          out[k.value] = (val === 'true');
        } else {
          out[k.value] = val;
        }
      }
    });
    hidden.value = JSON.stringify(out);
    // Also update pretty view if present
    var pretty = container.querySelector('.json-meta-pretty');
    if (pretty) pretty.textContent = JSON.stringify(out, null, 2);
  }

  // Support either a textarea or an input that was rendered for metadata.
  document.querySelectorAll('.json-metadata-widget').forEach(function(textarea) {
    // Build container
    var container = document.createElement('div');
    container.className = 'json-meta-editor';

    // Move the textarea into the container but keep it hidden
    textarea.parentNode.insertBefore(container, textarea);
    container.appendChild(textarea);
    // hide the actual input/textarea until user toggles raw JSON
    textarea.style.display = 'none';

    // Header with quick fields
    var header = document.createElement('div');
    header.className = 'json-meta-header';
    header.innerHTML = '\n      <label>Round: <input type="number" min="1" class="json-meta-round" style="width:5em"></label>\n      <label style="margin-left:10px">Central: <input type="checkbox" class="json-meta-central"></label>\n      <label style="margin-left:10px">Reason: <input type="text" class="json-meta-reason" style="width:18em"></label>\n      <label style="margin-left:10px">Origin: <input type="text" class="json-meta-origin" style="width:12em"></label>\n    ';
    container.appendChild(header);

    // Custom key/value area
    var customWrap = document.createElement('div');
    customWrap.className = 'json-meta-customs-wrap';
    var customList = document.createElement('div');
    customList.className = 'json-meta-customs';
    customWrap.appendChild(customList);
    var addCustom = document.createElement('div');
    addCustom.className = 'json-meta-addcustom';
    addCustom.innerHTML = '<input class="json-meta-newkey" placeholder="key"> <input class="json-meta-newval" placeholder="value"> <button type="button" class="json-meta-addbtn">Add</button>';
    customWrap.appendChild(addCustom);
    container.appendChild(customWrap);

    // Pretty JSON display
    var pretty = document.createElement('pre');
    pretty.className = 'json-meta-pretty';
    container.appendChild(pretty);

    // Raw toggle
      function initWithJSONEditor(textarea) {
        try {
          var container = document.createElement('div');
          container.className = 'json-meta-editor-jsoneditor';
          textarea.parentNode.insertBefore(container, textarea);
          textarea.style.display = 'none';

          var options = { modes: ['tree','view','form','code','text'], mode: 'tree', search: true };
          options.onChange = function() {
            try {
              var json = editor.get();
              textarea.value = JSON.stringify(json);
            } catch (e) {
              // ignore
            }
          };

          var editor = new JSONEditor(container, options);
          var initial = {};
          try { initial = JSON.parse(textarea.value || '{}'); } catch(e) { initial = {}; }
          editor.set(initial);

          // keep a reference so formset-added handlers can find editors
          textarea._jsoneditor_instance = editor;
          return true;
        } catch (e) {
          return false;
        }
      }

      document.querySelectorAll('.json-metadata-widget').forEach(function(textarea) {
    toggle.type = 'button';
        // If JSONEditor is available, use it; otherwise fall back to the lightweight editor
        if (typeof window.JSONEditor !== 'undefined') {
          if (initWithJSONEditor(textarea)) return;
        }

        // Fallback: initialize the lightweight editor (existing behavior)
        var container = document.createElement('div');
        container.className = 'json-meta-editor';

        // Move the textarea into the container but keep it hidden
        textarea.parentNode.insertBefore(container, textarea);
        container.appendChild(textarea);
        // hide the actual input/textarea until user toggles raw JSON
        textarea.style.display = 'none';

        // Header with quick fields
        var header = document.createElement('div');
        header.className = 'json-meta-header';
        header.innerHTML = '\n      <label>Round: <input type="number" min="1" class="json-meta-round" style="width:5em"></label>\n      <label style="margin-left:10px">Central: <input type="checkbox" class="json-meta-central"></label>\n      <label style="margin-left:10px">Reason: <input type="text" class="json-meta-reason" style="width:18em"></label>\n      <label style="margin-left:10px">Origin: <input type="text" class="json-meta-origin" style="width:12em"></label>\n    ';
        container.appendChild(header);

        // Custom key/value area
        var customWrap = document.createElement('div');
        customWrap.className = 'json-meta-customs-wrap';
        var customList = document.createElement('div');
        customList.className = 'json-meta-customs';
        customWrap.appendChild(customList);
        var addCustom = document.createElement('div');
        addCustom.className = 'json-meta-addcustom';
        addCustom.innerHTML = '<input class="json-meta-newkey" placeholder="key"> <input class="json-meta-newval" placeholder="value"> <button type="button" class="json-meta-addbtn">Add</button>';
        customWrap.appendChild(addCustom);
        container.appendChild(customWrap);

        // Pretty JSON display
        var pretty = document.createElement('pre');
        pretty.className = 'json-meta-pretty';
        container.appendChild(pretty);

        // Raw toggle
        var toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'json-meta-toggle-raw';
        toggle.textContent = 'Show raw JSON';
        toggle.style.marginTop = '6px';
        container.appendChild(toggle);

        // If there's existing JSON in the textarea/input, parse and populate fields
        var initial = parseMetadata(textarea.value || textarea.textContent || '');
        try {
          if (initial.round) container.querySelector('.json-meta-round').value = initial.round;
          if (initial.central) container.querySelector('.json-meta-central').checked = true;
          if (initial.reason) container.querySelector('.json-meta-reason').value = initial.reason;
          if (initial.origin) container.querySelector('.json-meta-origin').value = initial.origin;
          // other keys -> customs
          Object.keys(initial).forEach(function(k){
            if (['round','central','reason','origin'].indexOf(k) === -1) {
              var pair = createCustomPair(k, initial[k]);
              customList.appendChild(pair);
            }
          });
        } catch (e) {
          // ignore
        }

        // Wire up add custom
        customWrap.querySelector('.json-meta-addbtn').addEventListener('click', function(){
          var key = customWrap.querySelector('.json-meta-newkey').value;
          var val = customWrap.querySelector('.json-meta-newval').value;
          if (!key) return;
          var pair = createCustomPair(key, val);
          customList.appendChild(pair);
          customWrap.querySelector('.json-meta-newkey').value = '';
          customWrap.querySelector('.json-meta-newval').value = '';
          updateHiddenFor(container);
        });

        // Wire input changes to update hidden
        ['.json-meta-round', '.json-meta-central', '.json-meta-reason', '.json-meta-origin'].forEach(function(sel){
          var el = container.querySelector(sel);
          if (!el) return;
          el.addEventListener('change', function(){ updateHiddenFor(container); });
          el.addEventListener('input', function(){ updateHiddenFor(container); });
        });

        // Toggle raw JSON
        var rawVisible = false;
        toggle.addEventListener('click', function(){
          rawVisible = !rawVisible;
          if (rawVisible) {
            textarea.style.display = 'block';
            textarea.style.width = '100%';
            toggle.textContent = 'Hide raw JSON';
          } else {
            textarea.style.display = 'none';
            toggle.textContent = 'Show raw JSON';
          }
        });

        // Update pretty and hidden initially
        updateHiddenFor(container);
          });

      // Ensure newly-added inlines (Django formset add) are initialized
      document.addEventListener('formset:added', function(e){
        var el = e.detail ? e.detail.form : e.target;
        if (!el) return;
        var ta = el.querySelector && el.querySelector('.json-metadata-widget');
        if (ta) {
          // If JSONEditor available, try to init; otherwise run the normal init path
          if (typeof window.JSONEditor !== 'undefined') {
            initWithJSONEditor(ta);
          } else {
            // Trigger DOMContentLoaded handler on the newly added textarea by calling the same init code
            // Create a temporary event to call initializers
            // We'll simply call the core logic by creating and dispatching a custom event
            var ev = new Event('metadata-json-init');
            ta.dispatchEvent(ev);
          }
        }
      });

      // If JSONEditor loads after this script (CDN delay), poll for it briefly
      (function waitAndInitJSONEditor(){
        if (typeof window.JSONEditor !== 'undefined') {
          document.querySelectorAll('.json-metadata-widget').forEach(function(ta){
            // if not already enhanced
            if (!ta._jsoneditor_instance) {
              try { initWithJSONEditor(ta); } catch(e) { /* ignore */ }
            }
          });
          return;
        }
        // try again a few times
        var tries = 0;
        var interval = setInterval(function(){
          tries += 1;
          if (typeof window.JSONEditor !== 'undefined') {
            clearInterval(interval);
            document.querySelectorAll('.json-metadata-widget').forEach(function(ta){
              if (!ta._jsoneditor_instance) {
                try { initWithJSONEditor(ta); } catch(e) { /* ignore */ }
              }
            });
          } else if (tries > 20) { // stop after ~2s
            clearInterval(interval);
          }
        }, 100);
      })();

          updateHiddenFor(container);
        }

        var candidates = [];
        document.querySelectorAll('.json-metadata-widget').forEach(function(e){ candidates.push(e); });
        document.querySelectorAll('textarea[name*="metadata"], input[name*="metadata"]').forEach(function(e){ if (candidates.indexOf(e) === -1) candidates.push(e); });
        candidates.forEach(function(elem){ initMetadataElement(elem); });

        document.addEventListener('formset:added', function(ev) {
          try {
            var newForm = ev.target;
            newForm.querySelectorAll('.json-metadata-widget, textarea[name*="metadata"], input[name*="metadata"]').forEach(function(e){ initMetadataElement(e); });
          } catch (e) {}
        });
      });
