# Theme system removed

The dynamic frontend theme management system that used `FrontendTheme` in the
Django admin and exposed theme tokens via API endpoints has been removed from
the project. Styling is now controlled by static frontend files under
`frontend/src/styles/` (for example `tokens.js` and `theme-overrides.js`).

If you previously relied on the admin UI or API to change themes, restore
functionality by reintroducing a minimal API or editing the frontend static
tokens. Contact the maintainers if you want a guided restoration plan.