# feat(ui): Add design tokens, theme overrides, and small refactors

This branch introduces a small, incremental UI theming system and demonstrates usage across a couple of components.

What I changed

- Added design tokens: `frontend/src/styles/tokens.js` (colors, spacing helper).
- Added MUI overrides: `frontend/src/styles/theme-overrides.js` (button/table styles).
- Created a central theme: `frontend/src/theme.jsx` and integrated tokens/overrides.
- Wrapped app with `ThemeProvider` + `CssBaseline` in `frontend/src/main.jsx`.
- Added `NavListItem` component and simplified `Menu.jsx` so the nav uses `to` strings.
- Refactored `CreateClub.jsx` and `Dashboard.jsx` to use theme `sx` props and MUI components.
- Added placeholder screenshots under `design/screenshots/` for the visual checklist.

Why

Small, centralized theme tokens and overrides make the UI consistent and easier to maintain.

How to test locally

```powershell
cd frontend
npm ci
npm run dev
# or to build
npm run build
```

Visual checklist (replace placeholders with real screenshots before merging)

- [ ] Dashboard header and charts look consistent with theme
- [ ] Create Club form uses theme-aware button and spacing
- [ ] Navbar menu items show selected states and use ListItemButton style

Notes

- I could not push the branch to the remote due to permission issues. The branch exists locally as `feat/ui-theme-tokens` and commits are present.
- To push and create the PR, run:

```powershell
# push the branch
git push -u origin feat/ui-theme-tokens
# then open a PR on GitHub with title:
# feat(ui): add design tokens, theme overrides and refactor components to use theme
```

If you'd like, I can continue and refactor more components or wire up visual regression screenshots, but I'll need push access (or you can push the branch and open the PR, then I can continue).