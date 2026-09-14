# CKEditor5 custom build (@mention support)

`django-ckeditor-5` ships a prebuilt `dist/bundle.js` with a fixed plugin
list (no way to add a plugin via `CKEDITOR_5_CONFIGS` alone). This is a
from-source rebuild of that same bundle - same plugins, same CKEditor5
version (33.0.0) - plus:

- `@ckeditor/ckeditor5-mention` (the `@name` autocomplete)
- `MentionLinks` (`src/mentionlinks.js`), a small plugin that converts a
  selected mention into a real `<a href="...">` link instead of the
  default styled `<span>`, so the saved article HTML is just a plain
  link - no extra CSS/JS needed on the public site to render it.

The `@` feed itself (searching athletes/clubs via `/api/mentions/`) is
wired in `src/app.js`, applied to every CKEditor5 field on the site.

## Rebuilding

```
cd backend/tools/ckeditor5-custom-build
npm install
npm run build
cp dist/bundle.js dist/styles.css ../../static/django_ckeditor_5/dist/
```

`backend/static/` is in `STATICFILES_DIRS` ahead of the installed
`django_ckeditor_5` package's own static dir, so this override is picked
up automatically by `collectstatic` (and, in dev, directly) without
touching the installed package. Run `python manage.py collectstatic`
after copying the files so `staticfiles/` (what actually gets served) is
refreshed too - the widget's `<script>`/`<link>` tags reference the
static file by its plain logical name, not a content hash, in dev.

In production, `STORAGES` uses WhiteNoise's
`CompressedManifestStaticFilesStorage`, which content-hashes the file on
each deploy's `collectstatic` - so a rebuilt bundle there gets a new URL
automatically and there's no stale-cache concern like in local dev.

## When you touch this again

- Keep every `@ckeditor/ckeditor5-*` package pinned to the exact same
  version (see `package.json`) - CKEditor5 packages from different
  versions aren't guaranteed compatible in one build.
- `src/ckeditor.js` mirrors the plugin list from the installed package's
  own `venv/.../django_ckeditor_5/static/django_ckeditor_5/src/ckeditor.js`
  - if that list changes upstream (package upgrade), re-sync it here too.
