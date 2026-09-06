"""Import the static "Despre" (About) page content from vovinam.ro into `AboutSection`.

Same situation as the events importer: the WordPress page is built with the
Bricks page builder, so `wp-json/wp/v2/pages` returns an *empty*
`content.rendered` for this page (`/wp-json/wp/v2/pages?search=despre`) - the
actual text only exists in the rendered HTML at
https://vovinam.ro/federatie/despre/. There is no clean JSON source for this
content, so this command scrapes the live page directly (read-only, no
SSH/DB access to the WordPress droplet).

The live page has three simple text blocks (a hero intro paragraph, a
"Viziune" section with a short bullet list, and an "Obiective" section with a
long bullet list) that map 1:1 onto three `AboutSection` rows. None of those
blocks contain nested `<div>` elements internally (verified by manually
inspecting the fetched HTML), so a small "find opening tag by id, take
everything up to the next `</div>`" regex helper is enough to lift each
block's inner HTML - no need to add an HTML-parsing dependency (e.g. bs4)
just for this.

Idempotent: sections are matched and updated by `section_title` (get_or_create),
never duplicated across repeated runs.
"""

import re

import requests
from django.core.management.base import BaseCommand, CommandError

from landing.models import AboutSection

ABOUT_URL = "https://vovinam.ro/federatie/despre/"

# (source div id, target AboutSection.section_title, order)
HERO_TITLE_DIV = "brxe-gmjiho"
HERO_TEXT_DIV = "brxe-etojgh"
VIZIUNE_TEXT_DIV = "brxe-dycnkf"
OBIECTIVE_LABEL_DIV = "brxe-jagjwr"
OBIECTIVE_LIST_DIV = "brxe-rbjemc"


def _extract_div(html, div_id):
    """Return the inner HTML of the first `<div id="div_id" ...>...</div>`.

    Only safe because the specific blocks we scrape here contain no nested
    `<div>` elements (only headings/paragraphs/lists) - confirmed by
    inspecting the live page. Returns None if the id isn't found.
    """
    match = re.search(r'id="%s"[^>]*>' % re.escape(div_id), html)
    if not match:
        return None
    start = match.end()
    end = html.find("</div>", start)
    if end == -1:
        return None
    return html[start:end].strip()


def _extract_heading_text(html, heading_id):
    """Return the plain text content of `<h1/h2/... id="heading_id" ...>TEXT</...>`."""
    match = re.search(r'id="%s"[^>]*>(.*?)</h\d>' % re.escape(heading_id), html)
    return match.group(1).strip() if match else None


class Command(BaseCommand):
    help = "Import the 'Despre' (About) page content scraped from vovinam.ro into AboutSection."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Parse and print the sections without writing to the database.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]

        response = requests.get(ABOUT_URL, timeout=30)
        response.raise_for_status()
        html = response.text

        hero_title = _extract_heading_text(html, HERO_TITLE_DIV)
        hero_text = _extract_div(html, HERO_TEXT_DIV)
        viziune_text = _extract_div(html, VIZIUNE_TEXT_DIV)
        obiective_label = _extract_div(html, OBIECTIVE_LABEL_DIV)
        obiective_list = _extract_div(html, OBIECTIVE_LIST_DIV)

        if not hero_text or not viziune_text or not obiective_list:
            raise CommandError(
                "Could not find the expected content blocks on the live page - "
                "the vovinam.ro 'Despre' page markup may have changed. "
                "Aborting without writing anything."
            )

        hero_title = (hero_title or "Federația Română de Vovinam Viet-Vo-Dao").strip()
        obiective_content = (obiective_label or "") + obiective_list

        sections = [
            (hero_title, hero_text, 0),
            ("Viziune", viziune_text, 1),
            ("Obiective", obiective_content, 2),
        ]

        if dry_run:
            for title, content, order in sections:
                self.stdout.write(self.style.NOTICE(f"[dry-run] order={order} title={title!r}"))
                self.stdout.write(content[:300] + ("..." if len(content) > 300 else ""))
                self.stdout.write("")
            return

        created = 0
        updated = 0
        for title, content, order in sections:
            obj, was_created = AboutSection.objects.get_or_create(
                section_title=title,
                defaults={"content": content, "order": order, "is_active": True},
            )
            if was_created:
                created += 1
                self.stdout.write(self.style.SUCCESS(f"Created '{title}'"))
            else:
                obj.content = content
                obj.order = order
                obj.is_active = True
                obj.save(update_fields=["content", "order", "is_active"])
                updated += 1
                self.stdout.write(f"Updated '{title}'")

        self.stdout.write(self.style.SUCCESS(f"Done. created={created} updated={updated}"))
