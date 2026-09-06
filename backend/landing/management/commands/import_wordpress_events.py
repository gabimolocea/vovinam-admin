"""
Import competitions/events from the legacy WordPress site (vovinam.ro) into
`landing.Event`, via the public WP REST API + best-effort HTML scraping.

Read-only against WordPress: no credentials, no writes to vovinam.ro.

Why HTML scraping is needed (unlike `import_wordpress_content`): events on
vovinam.ro live under a custom post type (`evenimente_info`) whose actual
date/time, location and description are stored as ACF fields that are NOT
exposed by the WP REST API (`acf` comes back as an empty list for every
entry). The only place this data is available is the server-rendered page
markup, which - because the site uses the Bricks page builder - has a
stable, parseable structure:

    <h1 class="brxe-post-title">TITLE</h1>
    ...
    <div class="... post-meta"><span class="item">DD/MM/YYYY H:MM am|pm</span>
                                 <span class="item">LOCATION TEXT</span></div>
    <div class="... brxe-text">DESCRIPTION HTML</div>

The event "type" badge (e.g. "Stagiu national", "Campionat mondial") is
rendered on the /evenimente/ listing page instead of the detail page, but
that listing only ever shows the ~10 most recent events - so it's used as a
best-effort lookup, falling back to a title-based keyword heuristic for
older events that have scrolled off the listing.

This is a one-off migration helper for Etapa 2 of the vovinam.ro rebuild.
It is intentionally idempotent (safe to re-run): events are matched/updated
by slug.

Deliberate scope decisions (see PR discussion for the "events aren't
migrated" follow-up):
  - We NEVER auto-create `api.City` rows from scraped location text. City is
    a small shared reference table used elsewhere in the app (club/athlete
    city pickers); polluting it with WordPress free-text locations (which
    are sometimes a venue name, sometimes "Town, County", sometimes a
    foreign city) would be a bigger problem than leaving `city` empty. The
    raw location text is always preserved in `Event.address`, and `city` is
    only set when it exact-matches an *existing* City by name.
  - Imported events are only ever marked 'upcoming' or 'past' (based on
    `end_date` vs. now at import time), never 'ongoing' - the Event model
    enforces at most one 'ongoing' event globally (see Event.clean()), and
    that status is meant to be set live by staff running a real event, not
    backdated by a bulk import.
  - `end_date` is parsed from the "📅 D, D, D <month> <year>" line commonly
    present in the description (multi-day events); when that pattern isn't
    found, it defaults to `start_date + 1 day`, matching the same
    single-day-event convention already used elsewhere in this codebase
    (see `_LegacyEventManager.create()` in api/models/_common.py).

Usage:
    python manage.py import_wordpress_events
    python manage.py import_wordpress_events --limit 5
    python manage.py import_wordpress_events --source https://vovinam.ro
    python manage.py import_wordpress_events --dry-run
"""
import datetime
import html as html_module
import re
from datetime import timedelta

import requests
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand
from django.utils import timezone

from landing.models import Event
from api.models import City

try:
    from zoneinfo import ZoneInfo
    WP_DISPLAY_TZ = ZoneInfo("Europe/Bucharest")
except Exception:  # pragma: no cover - zoneinfo/tzdata unavailable
    WP_DISPLAY_TZ = None

POST_TYPE = "evenimente_info"

# "25/09/2026 6:00 pm" style date/time shown on the event page.
DATETIME_RE = re.compile(r"(\d{2})/(\d{2})/(\d{4})\s+(\d{1,2}):(\d{2})\s*([ap]m)", re.IGNORECASE)

# "📅 25, 26, 27 septembrie 2026" style multi-day date line in the description.
RO_MONTHS = {
    "ianuarie": 1, "februarie": 2, "martie": 3, "aprilie": 4, "mai": 5, "iunie": 6,
    "iulie": 7, "august": 8, "septembrie": 9, "octombrie": 10, "noiembrie": 11, "decembrie": 12,
}
DATE_RANGE_RE = re.compile(
    r"[\U0001F4C5]?\s*((?:\d{1,2}\s*,\s*)*\d{1,2})\s+(" + "|".join(RO_MONTHS) + r")\s+(\d{4})",
    re.IGNORECASE,
)

IMAGE_RE = re.compile(
    r'data-src="(https?://[^"]+/wp-content/uploads/[^"]+\.(?:jpe?g|png|webp))"',
    re.IGNORECASE,
)
META_RE = re.compile(
    r'post-meta">\s*<span class="item">([^<]*)</span>\s*<span class="item">([^<]*)</span>',
)
DESCRIPTION_RE = re.compile(r'class="[^"]*\bbrxe-text\b[^"]*">(.*?)</div>', re.DOTALL)

# Keyword -> Event.event_type mapping, checked (in order) against the WP
# listing-page badge text first, then the event title, case-insensitively.
EVENT_TYPE_KEYWORDS = [
    ("examen", "examination"),
    ("grad", "examination"),
    ("stagiu", "training_seminar"),
    ("seminar", "training_seminar"),
]


class Command(BaseCommand):
    help = (
        "Import competitions/events from the legacy WordPress site (vovinam.ro) "
        "into landing.Event, scraping date/location/description from the "
        "rendered event pages (not exposed via the WP REST API)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--source",
            default="https://vovinam.ro",
            help="Base URL of the WordPress site (default: https://vovinam.ro)",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=None,
            help="Import at most N events (useful for a sample/dry run).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Fetch and parse everything, but do not write to the database.",
        )
        parser.add_argument(
            "--skip-images",
            action="store_true",
            help="Skip downloading featured images (faster, useful for quick content-only tests).",
        )

    def handle(self, *args, **options):
        source = options["source"].rstrip("/")
        limit = options["limit"]
        dry_run = options["dry_run"]
        skip_images = options["skip_images"]

        self.stdout.write(f"Importing WordPress events from {source}")
        if dry_run:
            self.stdout.write(self.style.WARNING("--dry-run: no database writes will be made"))
        if WP_DISPLAY_TZ is None:
            self.stdout.write(self.style.WARNING(
                "zoneinfo/tzdata unavailable - treating WP event times as UTC"
            ))

        session = requests.Session()
        entries = self._fetch_all_events(session, source, limit)
        self.stdout.write(f"Fetched {len(entries)} event(s) from WordPress REST API")

        type_badges = self._fetch_type_badges(session, source)

        created, updated, skipped = 0, 0, 0
        for entry in entries:
            try:
                is_new = self._import_event(session, entry, type_badges, dry_run, skip_images)
            except Exception as exc:  # noqa: BLE001 - keep import going on a single bad event
                skipped += 1
                self.stderr.write(self.style.ERROR(
                    f"  ! Failed to import event id={entry.get('id')} "
                    f"slug={entry.get('slug')}: {exc}"
                ))
                continue
            if is_new:
                created += 1
            else:
                updated += 1

        self.stdout.write(self.style.SUCCESS(
            f"Done. created={created} updated={updated} skipped={skipped}"
        ))

    # -- fetching ----------------------------------------------------------

    def _fetch_all_events(self, session, source, limit):
        """Paginate through /wp-json/wp/v2/evenimente_info until an empty page."""
        entries = []
        page = 1
        while True:
            url = f"{source}/wp-json/wp/v2/{POST_TYPE}"
            resp = session.get(url, params={"per_page": 100, "page": page}, timeout=30)
            if resp.status_code == 400:
                break
            resp.raise_for_status()
            batch = resp.json()
            if not batch:
                break
            entries.extend(batch)
            if limit and len(entries) >= limit:
                entries = entries[:limit]
                break
            total_pages = int(resp.headers.get("X-WP-TotalPages", page))
            if page >= total_pages:
                break
            page += 1
        return entries

    def _fetch_type_badges(self, session, source):
        """Best-effort slug -> badge text (e.g. "Stagiu national") map, scraped
        from the /evenimente/ listing page. That page only shows the most
        recent events, so older ones simply won't be in the returned map and
        fall back to a title-based heuristic in `_infer_event_type`."""
        badges = {}
        try:
            resp = session.get(f"{source}/evenimente/", timeout=30)
            resp.raise_for_status()
        except requests.RequestException:
            return badges

        html = resp.text
        for match in re.finditer(rf'/{POST_TYPE}/([a-z0-9-]+)/', html):
            slug = match.group(1)
            if slug in badges:
                continue
            window = html[max(0, match.start() - 700):match.start()]
            metas = re.findall(r'post-meta">\s*<span class="item">([^<]*)</span>', window)
            if metas:
                badges[slug] = metas[-1]
        return badges

    def _import_event(self, session, entry, type_badges, dry_run, skip_images):
        slug = entry["slug"]
        title = self._clean_html_text(entry["title"]["rendered"])
        link = entry.get("link") or f"https://vovinam.ro/{POST_TYPE}/{slug}/"

        resp = session.get(link, timeout=30)
        resp.raise_for_status()
        html = resp.text

        start_date, address = self._parse_meta(html)
        if start_date is None:
            raise ValueError("could not parse event date/time from page meta")

        description_html = self._parse_description(html)
        end_date = self._parse_end_date(description_html, start_date)
        event_type = self._infer_event_type(type_badges.get(slug, ""), title)
        city = self._match_city(address)
        status = "past" if end_date < timezone.now() else "upcoming"

        if dry_run:
            self.stdout.write(
                f"  [dry-run] {title!r} ({slug}) -> {event_type}, "
                f"{start_date.isoformat()} .. {end_date.isoformat()}, "
                f"address={address!r}, city={city}"
            )
            return not Event.objects.filter(slug=slug).exists()

        event, is_new = Event.objects.get_or_create(slug=slug, defaults={"title": title, "start_date": start_date, "end_date": end_date})
        event.title = title
        event.description = description_html
        event.start_date = start_date
        event.end_date = end_date
        event.address = address
        event.city = city
        event.event_type = event_type
        event.status = status
        event.save()

        action = "Creating" if is_new else "Updating"
        self.stdout.write(f"  {action} {title!r} ({slug})")

        if not skip_images:
            self._import_featured_image(session, event, html)

        return is_new

    # -- parsing -------------------------------------------------------------

    def _parse_meta(self, html):
        """Returns (start_date_aware, address_text) from the post-meta block,
        e.g. <span class="item">25/09/2026 6:00 pm</span><span class="item">Miroslava, Iași</span>"""
        match = META_RE.search(html)
        if not match:
            return None, ""
        date_text, address = match.group(1).strip(), match.group(2).strip()

        dt_match = DATETIME_RE.search(date_text)
        if not dt_match:
            return None, address
        day, month, year, hour, minute, ampm = dt_match.groups()
        hour = int(hour) % 12
        if ampm.lower() == "pm":
            hour += 12
        naive = datetime.datetime(int(year), int(month), int(day), hour, int(minute))
        if WP_DISPLAY_TZ is not None:
            aware = naive.replace(tzinfo=WP_DISPLAY_TZ)
        else:
            aware = timezone.make_aware(naive, timezone=timezone.utc)
        return aware, address

    def _parse_description(self, html):
        match = DESCRIPTION_RE.search(html)
        return match.group(1).strip() if match else ""

    def _parse_end_date(self, description_html, start_date):
        """Looks for a "📅 25, 26, 27 septembrie 2026" style line to compute
        the last day of a multi-day event; falls back to start_date + 1 day
        (the same single-day convention used elsewhere in this codebase)."""
        match = DATE_RANGE_RE.search(description_html)
        if match:
            days_text, month_name, year_text = match.groups()
            days = [int(d.strip()) for d in days_text.split(",") if d.strip()]
            if days:
                last_day = max(days)
                month = RO_MONTHS[month_name.lower()]
                try:
                    end_naive_date = start_date.replace(
                        year=int(year_text), month=month, day=last_day
                    )
                    # Keep the same time-of-day as start_date, but never end
                    # before it starts (defensive, in case of odd data).
                    if end_naive_date >= start_date:
                        return end_naive_date
                except ValueError:
                    pass
        return start_date + timedelta(days=1)

    def _infer_event_type(self, badge_text, title):
        haystack = f"{badge_text} {title}".lower()
        for keyword, event_type in EVENT_TYPE_KEYWORDS:
            if keyword in haystack:
                return event_type
        return "competition"

    def _match_city(self, address):
        """Exact (case-insensitive) match against an *existing* City only -
        never auto-creates City rows from scraped WP text (see module
        docstring)."""
        if not address:
            return None
        candidates = [part.strip() for part in address.split(",") if part.strip()]
        candidates.append(address.strip())
        for candidate in candidates:
            city = City.objects.filter(name__iexact=candidate).first()
            if city:
                return city
        return None

    def _import_featured_image(self, session, event, html):
        if event.featured_image:
            return
        # Anchor the search to *after* the post title so we never pick up the
        # site logo or other header images that also carry a lazy-loaded
        # `data-src="...wp-content/uploads/..."` attribute earlier in the
        # page (this previously caused every single event to end up with the
        # same "Screenshot-2023-11-01-at-12.28.35.png" file - that's actually
        # the site's own logo image, not an event photo).
        title_match = re.search(r'class="[^"]*\bbrxe-post-title\b[^"]*"', html)
        search_start = title_match.end() if title_match else 0
        match = IMAGE_RE.search(html, search_start)
        if not match:
            return
        image_url = match.group(1)
        try:
            resp = session.get(image_url, timeout=30)
            resp.raise_for_status()
        except requests.RequestException as exc:
            self.stderr.write(self.style.WARNING(
                f"    ! Failed to download featured image {image_url}: {exc}"
            ))
            return
        filename = image_url.rsplit("/", 1)[-1]
        event.featured_image.save(filename, ContentFile(resp.content), save=True)

    def _clean_html_text(self, value):
        return html_module.unescape(value or "").strip()
