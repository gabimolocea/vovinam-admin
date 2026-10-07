"""Where the old WordPress site's addresses live now.

Google still knows vovinam.ro by its WordPress URLs - articles at the
root (/congres-evvf-2025/), events under /evenimente_info/, member pages,
categories, tags, paginated archives, uploaded PDFs. Without a redirect
they all landed on the app's "not found" page, which is noindex, so Search
Console listed them under "Excluded by 'noindex' tag" and whatever ranking
they had was thrown away. The import kept the WordPress slugs, so most of
them map one to one onto a page that exists today.
"""

# First path segments the public site itself uses (apps/public-site/src/App.jsx).
# A single-segment path outside this set is treated as a possible old article.
CURRENT_ROUTES = {
    'noutati', 'galerie', 'video', 'despre', 'calendar', 'competitie', 'cluburi',
    'sportivi', 'staff', 'arbitri', 'regulament', 'documente', 'autentificare',
    'inregistrare', 'cont', 'reseteaza-parola', 'onboarding', 'termeni-si-conditii',
    'confidentialitate', 'gdpr', 'competitii', 'contact',
}

DOCUMENT_EXTENSIONS = ('.pdf', '.doc', '.docx', '.xls', '.xlsx')

FEDERATIE_PAGES = {'arbitri': '/arbitri', 'staff': '/staff'}


def _news_path(slug):
    from landing.models import NewsPost

    if NewsPost.objects.filter(slug=slug, published=True).exists():
        return f'/noutati/{slug}'
    return None


def _event_path(slug):
    from landing.models import Event

    # Same visibility rule as the public calendar API (PublicEventViewSet).
    if Event.objects.filter(slug=slug, organizing_club__isnull=True, is_publicly_visible=True).exists():
        return f'/calendar/{slug}'
    return None


def legacy_redirect(path):
    """The current address for an old WordPress URL, or None if it isn't one."""
    parts = [part for part in path.split('/') if part]
    if not parts:
        return None
    first = parts[0].lower()
    if parts[-1].lower() == 'feed':
        return None
    if first in ('category', 'tag'):
        return '/noutati'
    if first == 'noutati' and len(parts) >= 2 and parts[1] == 'page':
        return '/noutati'
    if first == 'evenimente_info':
        slug = parts[1] if len(parts) > 1 else ''
        return (slug and (_event_path(slug) or _news_path(slug))) or '/calendar'
    if first == 'membri':
        return '/staff'
    if first == 'federatie':
        return FEDERATIE_PAGES.get(parts[1] if len(parts) > 1 else '', '/despre')
    if first == 'privacy-policy':
        return '/confidentialitate'
    if first == 'wp-content':
        # Only uploaded documents have a page that replaced them. Theme and
        # plugin files, images, and junk like the literal "/wp-content/uploads/*"
        # Google picked up from the old robots.txt are gone for good - see
        # is_gone() - and redirecting them to /documente would be a lie.
        lower = path.lower()
        if not lower.endswith(DOCUMENT_EXTENSIONS):
            return None
        return '/regulament' if 'regulament' in lower else '/documente'
    if len(parts) == 1 and first not in CURRENT_ROUTES:
        return _news_path(parts[0]) or _event_path(parts[0])
    return None


def is_gone(path):
    """Old WordPress files with no replacement: answered 410, so Google drops them.

    That covers /wp-content/ files that aren't documents, and the RSS feeds
    WordPress had for the site, every article, category and tag
    (/feed/, /<article>/feed/, /tag/<tag>/feed/) - the new site has none.
    """
    parts = [part for part in path.lower().split('/') if part]
    return bool(parts) and (parts[0] == 'wp-content' or parts[-1] == 'feed')
