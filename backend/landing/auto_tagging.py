"""Tag the athletes and clubs an article names, without anyone typing "@".

When a published article is saved, its text is scanned for the full name of
every approved athlete and every club. The first time each one appears it
becomes the same link the editor's @mention makes (a.ck-mention-link, with
the hover card on the site), and the athletes are added to the post's
tagged_athletes so it reaches their coach's feed.

Only what can't be mistaken is tagged: a full name (first and last, in either
order, diacritics ignored), as whole words, and only if no other athlete or
club shares it. Names in headings or already inside a link are left alone,
as is anyone already tagged by hand.
"""
import html
import re
import unicodedata

# Text inside these is never turned into a link.
SKIP_TAGS = {'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'script', 'style', 'code', 'pre'}
VOID_TAGS = {'br', 'img', 'hr', 'input', 'meta', 'link', 'source', 'wbr', 'col', 'area', 'base', 'embed', 'param', 'track'}

TOKEN_RE = re.compile(r'(<!--.*?-->|<[^>]+>)', re.S)
TAG_NAME_RE = re.compile(r'<\s*(/)?\s*([a-zA-Z0-9]+)')
ENTITY_RE = re.compile(r'&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z]+\d*);')
MENTION_RE = re.compile(r'<a\b[^>]*\bck-mention-link\b[^>]*>', re.I)
HREF_RE = re.compile(r'href="(/sportivi/(\d+)|/cluburi/([^"]+))"')


def fold(text):
    """Lowercase, without diacritics, whitespace collapsed - how names are compared."""
    decomposed = unicodedata.normalize('NFKD', text)
    plain = ''.join(ch for ch in decomposed if not unicodedata.combining(ch)).lower()
    return ' '.join(plain.split())


def _folded_with_positions(raw):
    """`raw` text (entities and all) folded like fold(), plus, for each
    folded character, the raw span it came from - so a match found in the
    folded text can be cut out of the raw text exactly."""
    chars, spans = [], []
    i = 0
    while i < len(raw):
        entity = ENTITY_RE.match(raw, i) if raw[i] == '&' else None
        if entity:
            text, end = html.unescape(entity.group()), entity.end()
        else:
            text, end = raw[i], i + 1
        for ch in text:
            if ch.isspace():
                folded = ' '
            else:
                folded = ''.join(c for c in unicodedata.normalize('NFKD', ch) if not unicodedata.combining(c)).lower()
            for out in folded:
                chars.append(out)
                spans.append((i, end))
        i = end
    return ''.join(chars), spans


def build_index():
    """{folded name: (kind, id, url)} for every name that names exactly one
    athlete or club. A name shared by two of them is left out - it can't be
    tagged without guessing."""
    from api.models import Athlete, Club

    seen, ambiguous = {}, set()

    def add(key, entity):
        if len(key.split()) < 2 or len(key) < 6:
            return
        if key in seen and seen[key][:2] != entity[:2]:
            ambiguous.add(key)
        seen.setdefault(key, entity)

    athletes = Athlete.objects.filter(status='approved', is_deleted=False).only('id', 'first_name', 'last_name')
    for athlete in athletes:
        entity = ('athlete', athlete.id, f'/sportivi/{athlete.id}')
        add(fold(f'{athlete.first_name} {athlete.last_name}'), entity)
        add(fold(f'{athlete.last_name} {athlete.first_name}'), entity)
    for club in Club.objects.only('id', 'name', 'slug'):
        if club.slug:
            add(fold(club.name), ('club', club.id, f'/cluburi/{club.slug}'))

    return {key: entity for key, entity in seen.items() if key not in ambiguous}


def _pattern(index):
    if not index:
        return None
    names = sorted(index, key=len, reverse=True)  # longest first: "Ion Popescu Junior" before "Ion Popescu"
    return re.compile(r'(?<![\w-])(' + '|'.join(re.escape(name) for name in names) + r')(?![\w-])')


def _already_mentioned(content):
    athletes, clubs = set(), set()
    for tag in MENTION_RE.findall(content):
        href = HREF_RE.search(tag)
        if not href:
            continue
        if href.group(2):
            athletes.add(int(href.group(2)))
        elif href.group(3):
            clubs.add(href.group(3))
    return athletes, clubs


def auto_tag_html(content, index):
    """Returns (new_content, athlete_ids, club_ids): the content with the
    first appearance of each named athlete/club linked, the ids of every
    athlete it mentions (by hand or now), and the clubs newly linked."""
    content = content or ''
    pattern = _pattern(index)
    linked_athletes, linked_club_slugs = _already_mentioned(content)
    mentioned_athletes = set(linked_athletes)
    new_clubs = set()
    if pattern is None:
        return content, mentioned_athletes, new_clubs

    out, skip_depth, stack = [], 0, []
    for token in TOKEN_RE.split(content):
        if not token:
            continue
        if token.startswith('<'):
            out.append(token)
            name_match = TAG_NAME_RE.match(token)
            if not name_match or token.startswith('<!--'):
                continue
            closing, name = bool(name_match.group(1)), name_match.group(2).lower()
            if name in VOID_TAGS or token.rstrip().endswith('/>'):
                continue
            if closing:
                if name in stack:
                    while stack:
                        popped = stack.pop()
                        if popped in SKIP_TAGS:
                            skip_depth -= 1
                        if popped == name:
                            break
            else:
                stack.append(name)
                if name in SKIP_TAGS:
                    skip_depth += 1
            continue

        if skip_depth:
            out.append(token)
            continue

        folded, spans = _folded_with_positions(token)
        cursor, pieces = 0, []
        for match in pattern.finditer(folded):
            kind, entity_id, url = index[match.group(1)]
            if kind == 'athlete' and entity_id in linked_athletes:
                continue
            if kind == 'club' and url.rsplit('/', 1)[-1] in linked_club_slugs:
                continue
            start, end = spans[match.start()][0], spans[match.end() - 1][1]
            if start < cursor:
                continue
            raw_name = token[start:end]
            display = html.escape(html.unescape(raw_name), quote=True)
            pieces.append(token[cursor:start])
            pieces.append(
                f'<a class="ck-mention-link" data-mention="@{display}" '
                f'data-mention-type="{kind}" href="{url}">{raw_name}</a>'
            )
            cursor = end
            if kind == 'athlete':
                linked_athletes.add(entity_id)
                mentioned_athletes.add(entity_id)
            else:
                linked_club_slugs.add(url.rsplit('/', 1)[-1])
                new_clubs.add(entity_id)
        pieces.append(token[cursor:])
        out.append(''.join(pieces))

    return ''.join(out), mentioned_athletes, new_clubs


def auto_tag_post(post, index=None):
    """Tag `post` in place (content and tagged_athletes) if it's published.
    Returns the athletes newly added to tagged_athletes, for the admin message."""
    if not post.published:
        return []
    from api.models import Athlete

    index = build_index() if index is None else index
    new_content, athlete_ids, _clubs = auto_tag_html(post.content, index)
    if new_content != post.content:
        # update(), not save(): nothing else about the post changed, so its
        # updated_at (the sitemap's lastmod) and auto-filled SEO stay put.
        type(post).objects.filter(pk=post.pk).update(content=new_content)
        post.content = new_content

    already = set(post.tagged_athletes.values_list('id', flat=True))
    added = [athlete_id for athlete_id in athlete_ids if athlete_id not in already]
    if added:
        post.tagged_athletes.add(*added)
    return list(Athlete.objects.filter(pk__in=added).order_by('last_name', 'first_name'))
