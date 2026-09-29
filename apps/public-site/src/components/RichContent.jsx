import { useEffect, useRef, useState } from 'react';
import Lightbox from './Lightbox';

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

export default function RichContent({ html, className = 'prose-content ck-content max-w-none' }) {
  const containerRef = useRef(null);
  const [images, setImages] = useState([]);
  const [index, setIndex] = useState(null);

  useEffect(() => {
    // Cursorul e singurul indiciu ca poza se poate deschide; altfel nimeni
    // nu incearca sa dea clic pe ea.
    containerRef.current?.querySelectorAll('img').forEach((img) => {
      img.style.cursor = 'zoom-in';
    });
  }, [html]);

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
        dangerouslySetInnerHTML={{ __html: html }}
      />
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
