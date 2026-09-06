"""
Import news content from the legacy WordPress site (vovinam.ro) into the
`landing.NewsPost` / `landing.NewsPostGallery` models via the public WP REST
API. Read-only against WordPress: no credentials, no writes to vovinam.ro.

This is a one-off migration helper for Etapa 2 of the vovinam.ro rebuild.
It is intentionally idempotent (safe to re-run): posts are matched/updated
by slug, and already-downloaded gallery images are skipped by filename.

Usage:
    python manage.py import_wordpress_content
    python manage.py import_wordpress_content --limit 20
    python manage.py import_wordpress_content --source https://vovinam.ro
    python manage.py import_wordpress_content --dry-run
"""
import re
import time
from urllib.parse import urlparse

import requests
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError
from django.template.defaultfilters import truncatewords_html
from django.utils.dateparse import parse_datetime
from django.utils.text import slugify

from landing.models import NewsPost, NewsPostGallery
from api.models import User

# Matches any WordPress media library upload URL referenced in post HTML,
# e.g. https://vovinam.ro/wp-content/uploads/2026/08/photo-1024x685.jpeg
UPLOAD_URL_RE = re.compile(
    r'https?://[^\s"\'<>]+/wp-content/uploads/[^\s"\'<>]+\.(?:jpe?g|png|gif|webp)',
    re.IGNORECASE,
)
# Matches the WordPress "resized" suffix (e.g. "-1024x685") right before the extension
RESIZE_SUFFIX_RE = re.compile(r'-(\d+)x(\d+)(?=\.[a-zA-Z]+$)')

# Cap on the width we'll pick when several resized variants of the same image
# are referenced in the post HTML (e.g. via srcset). WordPress keeps the raw
# camera original (often 6000px+/several MB) available at the bare filename,
# but the page itself never actually links to anything above ~2048px wide -
# downloading the true original would be far heavier than anything a browser
# ever renders, so we deliberately pick the largest *referenced* variant
# instead of the unsized "canonical" filename.
MAX_IMAGE_WIDTH = 2048


class Command(BaseCommand):
    help = (
        "Import posts from the legacy WordPress site (vovinam.ro) into "
        "landing.NewsPost, downloading referenced images into NewsPostGallery."
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
            help="Import at most N posts (useful for a sample/dry run).",
        )
        parser.add_argument(
            "--per-page",
            type=int,
            default=100,
            help="WP REST API page size (max 100).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Fetch and parse everything, but do not write to the database.",
        )
        parser.add_argument(
            "--skip-images",
            action="store_true",
            help="Skip downloading images (faster, useful for quick content-only tests).",
        )
        parser.add_argument(
            "--author-username",
            default=None,
            help="Username of an admin user to attribute imported posts to. "
                 "Defaults to the first user with role='admin'.",
        )

    def handle(self, *args, **options):
        source = options["source"].rstrip("/")
        limit = options["limit"]
        per_page = min(options["per_page"], 100)
        dry_run = options["dry_run"]
        skip_images = options["skip_images"]

        author = self._resolve_author(options["author_username"])
        if author is None:
            raise CommandError(
                "No admin user found to attribute imported posts to. "
                "Create one first (createsuperuser / role='admin') or pass --author-username."
            )

        self.stdout.write(f"Importing WordPress content from {source} (author={author})")
        if dry_run:
            self.stdout.write(self.style.WARNING("--dry-run: no database writes will be made"))

        posts = self._fetch_all_posts(source, per_page, limit)
        self.stdout.write(f"Fetched {len(posts)} post(s) from WordPress REST API")

        created, updated, skipped = 0, 0, 0
        for wp_post in posts:
            try:
                is_new = self._import_post(source, wp_post, author, dry_run, skip_images)
            except Exception as exc:  # noqa: BLE001 - keep import going on a single bad post
                skipped += 1
                self.stderr.write(self.style.ERROR(
                    f"  ! Failed to import post id={wp_post.get('id')} "
                    f"slug={wp_post.get('slug')}: {exc}"
                ))
                continue
            if is_new:
                created += 1
            else:
                updated += 1

        self.stdout.write(self.style.SUCCESS(
            f"Done. created={created} updated={updated} skipped={skipped}"
        ))

    # -- helpers ---------------------------------------------------------

    def _resolve_author(self, username):
        if username:
            return User.objects.filter(username=username).first()
        return User.objects.filter(role="admin").order_by("id").first()

    def _fetch_all_posts(self, source, per_page, limit):
        """Paginate through /wp-json/wp/v2/posts until an empty page is returned."""
        posts = []
        page = 1
        while True:
            url = f"{source}/wp-json/wp/v2/posts"
            params = {"per_page": per_page, "page": page, "_embed": 1}
            resp = requests.get(url, params=params, timeout=30)
            if resp.status_code == 400:
                # WP returns 400 "rest_post_invalid_page_number" once past the last page
                break
            resp.raise_for_status()
            batch = resp.json()
            if not batch:
                break
            posts.extend(batch)
            if limit and len(posts) >= limit:
                posts = posts[:limit]
                break
            total_pages = int(resp.headers.get("X-WP-TotalPages", page))
            if page >= total_pages:
                break
            page += 1
        return posts

    def _import_post(self, source, wp_post, author, dry_run, skip_images):
        slug = wp_post["slug"]
        title = self._clean_html_text(wp_post["title"]["rendered"])
        content_html = wp_post["content"]["rendered"]
        excerpt_html = wp_post.get("excerpt", {}).get("rendered", "").strip()
        if not excerpt_html:
            excerpt_html = truncatewords_html(content_html, 40)
        created_at = parse_datetime(wp_post["date_gmt"] + "Z") or None

        existing = NewsPost.objects.filter(slug=slug).first()
        is_new = existing is None
        post = existing or NewsPost(slug=slug)

        post.title = title
        post.content = content_html
        post.excerpt = excerpt_html
        post.published = True
        if created_at:
            post.created_at = created_at
        if is_new:
            post.author = author

        action = "Creating" if is_new else "Updating"
        self.stdout.write(f"  {action} '{title}' ({slug})")

        if dry_run:
            return is_new

        post.save()

        if not skip_images:
            self._import_images(source, wp_post, post)

        return is_new

    def _import_images(self, source, wp_post, post):
        """Download featured image + inline body images into NewsPostGallery,
        and use the first one as featured_image if it's not already set."""
        image_urls = []

        embedded = wp_post.get("_embedded", {})
        featured_media = embedded.get("wp:featuredmedia") or []
        if featured_media:
            source_url = featured_media[0].get("source_url")
            if source_url:
                image_urls.append(source_url)

        content_html = wp_post["content"]["rendered"]
        for match in UPLOAD_URL_RE.findall(content_html):
            image_urls.append(match)

        # De-duplicate resized variants (e.g. "-1024x685", "-300x201") of the
        # same image down to a single URL. Group by the canonical (unsized)
        # basename, then pick the largest width that was actually referenced
        # in the HTML, capped at MAX_IMAGE_WIDTH. Never fabricate a URL by
        # stripping the size suffix ourselves: the raw, unsized filename also
        # resolves on WordPress but serves the untouched camera original
        # (often 6000px+/several MB), which is never what the page renders
        # and would make this import needlessly slow and heavy.
        groups = {}
        order = []
        for url in image_urls:
            match = RESIZE_SUFFIX_RE.search(url)
            canonical = RESIZE_SUFFIX_RE.sub("", url)
            width = int(match.group(1)) if match else None
            if canonical not in groups:
                order.append(canonical)
                groups[canonical] = []
            groups[canonical].append((width, url))

        unique_urls = []
        for canonical in order:
            candidates = groups[canonical]
            sized = [(w, u) for w, u in candidates if w is not None and w <= MAX_IMAGE_WIDTH]
            if sized:
                _, best_url = max(sized, key=lambda pair: pair[0])
            else:
                # Only variant referenced has no size suffix (e.g. a small
                # logo/icon WordPress never resized) - use it as-is.
                _, best_url = candidates[0]
            unique_urls.append(best_url)

        existing_filenames = set(
            NewsPostGallery.objects.filter(news_post=post)
            .values_list("image", flat=True)
        )
        existing_basenames = {name.rsplit("/", 1)[-1] for name in existing_filenames}
        # A previously-imported featured_image must also count as "already
        # downloaded", otherwise re-running the command re-adds it as a
        # duplicate gallery item on every subsequent run (it's stored on
        # NewsPost.featured_image, not in NewsPostGallery, so it would
        # never show up in the query above).
        if post.featured_image:
            existing_basenames.add(post.featured_image.name.rsplit("/", 1)[-1])

        next_order = 0
        for url in unique_urls:
            filename = urlparse(url).path.rsplit("/", 1)[-1]
            if filename in existing_basenames:
                continue  # already imported, keep idempotent

            content = self._download(url)
            if content is None:
                continue

            if not post.featured_image:
                post.featured_image.save(filename, ContentFile(content), save=True)
            else:
                gallery_item = NewsPostGallery(news_post=post, order=next_order)
                gallery_item.image.save(filename, ContentFile(content), save=True)
                next_order += 1
            existing_basenames.add(filename)

    def _download(self, url, retries=2):
        for attempt in range(retries + 1):
            try:
                resp = requests.get(url, timeout=30)
                if resp.status_code == 200:
                    return resp.content
                return None
            except requests.RequestException as exc:
                if attempt == retries:
                    self.stderr.write(self.style.WARNING(f"    ! Could not download {url}: {exc}"))
                    return None
                time.sleep(1)

    def _clean_html_text(self, value):
        return re.sub(r"&#8211;|&#8212;", "-", value).replace("&#8222;", '"').replace("&#8221;", '"').strip()
