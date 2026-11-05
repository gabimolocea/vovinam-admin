import { useEffect, useMemo, useRef, useState } from 'react';
import Lightbox from './Lightbox';
import MentionCard from './MentionCard';

/**
 * Continut scris in CKEditor, cu pozele din text deschise in lightbox.
 *
 * HTML-ul vine gata format de la editor, asa ca nu-l parcurgem in React -
 * il randam ca pana acum si prindem clicul pe container. Daca s-a dat clic
 * pe o imagine, adunam toate imaginile din acel continut si deschidem
 * vizualizatorul la pozitia ei, ca sa se poata derula prin toate.
 */
function captionFor(img) {
  // CKEditor pune imaginile in <figure class="image"> cu <figcaption>.
  const caption = img.closest('figure')?.querySelector('figcaption');
  return caption?.textContent.trim() || '';
}

// CKEditor writes a tagged athlete or club as <a class="ck-mention-link"
// data-mention="@Name" ...>@Name</a>. The "@" is how the editor's
// autocomplete is triggered, not part of the name, so it's dropped here -
// for every article already written, not only new ones.
function withoutMentionAt(html) {
  return (html || '').replace(/(<a\b[^>]*\bck-mention-link\b[^>]*>)@/g, '$1');
}

function athleteIdOf(link) {
  if (link.dataset.mentionType !== 'athlete') return null;
  const match = /\/sportivi\/(\d+)/.exec(link.getAttribute('href') || '');
  return match ? match[1] : null;
}

export default function RichContent({ html, className = 'prose-content ck-content max-w-none' }) {
  const containerRef = useRef(null);
  const [images, setImages] = useState([]);
  const [index, setIndex] = useState(null);
  const [mention, setMention] = useState(null);
  const hideTimer = useRef(null);
  const cleanHtml = useMemo(() => withoutMentionAt(html), [html]);

  function keepMention() {
    clearTimeout(hideTimer.current);
  }

  function hideMentionSoon() {
    clearTimeout(hideTimer.current);
    // A short grace period, so the pointer can travel from the name onto
    // the card without the card vanishing on the way.
    hideTimer.current = setTimeout(() => setMention(null), 150);
  }

  function handleMouseOver(event) {
    const link = event.target.closest?.('a.ck-mention-link');
    if (!link || !containerRef.current?.contains(link)) return;
    const athleteId = athleteIdOf(link);
    if (!athleteId) return;
    keepMention();
    setMention((current) => (current?.anchor === link ? current : { anchor: link, athleteId, name: link.textContent.trim() }));
  }

  function handleMouseOut(event) {
    const link = event.target.closest?.('a.ck-mention-link');
    if (link && !link.contains(event.relatedTarget)) hideMentionSoon();
  }

  useEffect(() => () => clearTimeout(hideTimer.current), []);

  useEffect(() => {
    if (!mention) return undefined;
    // The card is placed against the name's position on screen, so it
    // would drift away from it on scroll - close it instead.
    const close = () => setMention(null);
    window.addEventListener('scroll', close, { passive: true, once: true });
    return () => window.removeEventListener('scroll', close);
  }, [mention]);

  useEffect(() => {
    // Cursorul e singurul indiciu ca poza se poate deschide; altfel nimeni
    // nu incearca sa dea clic pe ea.
    containerRef.current?.querySelectorAll('img').forEach((img) => {
      img.style.cursor = 'zoom-in';
    });
  }, [cleanHtml]);

  function handleClick(event) {
    const target = event.target;
    if (!target || target.tagName !== 'IMG') return;
    // O imagine pusa ca link duce unde a vrut autorul, nu in lightbox.
    if (target.closest('a')) return;

    const all = Array.from(containerRef.current?.querySelectorAll('img') || []);
    const position = all.indexOf(target);
    if (position < 0) return;

    event.preventDefault();
    setImages(all.map((img) => ({
      image: img.currentSrc || img.src,
      alt_text: img.alt || '',
      caption: captionFor(img),
    })));
    setIndex(position);
  }

  return (
    <>
      <div
        ref={containerRef}
        className={className}
        onClick={handleClick}
        onMouseOver={handleMouseOver}
        onMouseOut={handleMouseOut}
        dangerouslySetInnerHTML={{ __html: cleanHtml }}
      />
      {mention && (
        <MentionCard
          key={mention.athleteId}
          athleteId={mention.athleteId}
          name={mention.name}
          anchor={mention.anchor}
          onMouseEnter={keepMention}
          onMouseLeave={hideMentionSoon}
        />
      )}
      {index !== null && images[index] && (
        <Lightbox
          image={images[index]}
          onClose={() => setIndex(null)}
          onPrev={index > 0 ? () => setIndex((i) => i - 1) : undefined}
          onNext={index < images.length - 1 ? () => setIndex((i) => i + 1) : undefined}
        />
      )}
    </>
  );
}
