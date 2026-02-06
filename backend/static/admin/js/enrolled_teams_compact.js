document.addEventListener('DOMContentLoaded', function () {
  const scoreFields = ['ref1_score', 'ref2_score', 'ref3_score', 'ref4_score', 'ref5_score'];
  const inlineGroups = document.querySelectorAll('.inline-group[id^="categoryteam_set"]');

  inlineGroups.forEach((group) => {
    scoreFields.forEach((field) => {
      group.querySelectorAll(`input[name*="${field}"], input[id*="${field}"]`).forEach((el) => {
        el.style.width = '80px';
        el.style.maxWidth = '80px';
        el.style.minWidth = '80px';
      });

      group.querySelectorAll(`th.column-${field}, td.field-${field}`).forEach((el) => {
        el.style.width = '80px';
        el.style.maxWidth = '80px';
        el.style.minWidth = '80px';
      });
    });
  });
});
