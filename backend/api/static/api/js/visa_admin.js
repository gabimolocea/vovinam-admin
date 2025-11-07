// Toggle visibility of the health_status field in the Visa admin form
// Only show health_status when visa_type == 'medical'
(function() {
  function getHealthRow() {
    // Django admin uses .form-row.field-<fieldname>
    return document.querySelector('.form-row.field-health_status');
  }

  function getVisaTypeEl() {
    return document.getElementById('id_visa_type');
  }

  function toggleHealth() {
    var visaEl = getVisaTypeEl();
    var healthRow = getHealthRow();
    if (!visaEl || !healthRow) return;
    var value = visaEl.value;
    if (value === 'medical') {
      healthRow.style.display = '';
    } else {
      // hide the entire row so label and input are hidden
      healthRow.style.display = 'none';
      // Also clear value when hidden to avoid accidental submission
      var input = healthRow.querySelector('input, select, textarea');
      if (input) {
        try { input.value = ''; } catch (e) { /* ignore */ }
      }
    }
  }

  document.addEventListener('DOMContentLoaded', function() {
    var visaEl = getVisaTypeEl();
    if (!visaEl) return;
    // Run once to set initial visibility
    toggleHealth();
    // Update when visa_type changes
    visaEl.addEventListener('change', toggleHealth);
  });
})();
