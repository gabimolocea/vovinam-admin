document.addEventListener('DOMContentLoaded', () => {
  const tabLists = document.querySelectorAll(
    '[role="tablist"], ul.changeform-tabs, .changeform-tabs ul, .tabbed-changeform ul.tabs, .tabbed-changeform .tabs'
  );

  tabLists.forEach((list) => {
    const items = Array.from(list.querySelectorAll('li'));
    const timestampsItem = items.find((li) => {
      const label = (li.textContent || '').trim().toLowerCase();
      return label === 'timestamps';
    });

    if (timestampsItem) {
      list.appendChild(timestampsItem);
    }
  });
});
