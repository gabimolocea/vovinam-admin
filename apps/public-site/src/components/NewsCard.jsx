import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { stripInlineGalleries } from '../lib/htmlContent';

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** The single news-card component used everywhere a post is shown as a
 * grid tile (homepage "Știri recente" and the "Noutăți" list page), so
 * both stay visually identical - including the hover state. */
export default function NewsCard({ post }) {
  return (
    <Link
      to={`/noutati/${post.slug}`}
      className="group flex flex-col rounded-xl border border-[#dce0e5] bg-white p-2 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-[#0a4c75] hover:shadow-lg"
    >
      <div className="aspect-[490/273] w-full overflow-hidden rounded-lg bg-muted">
        {post.featured_image && (
          <img
            src={post.featured_image}
            alt={post.featured_image_alt || post.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-4 px-4 py-6">
        <p className="text-sm uppercase text-[#00334d]">{formatDate(post.created_at)}</p>
        <h3 className="text-fluid-h3 font-display font-bold text-[#00334d] transition-colors group-hover:text-[#0a4c75]">{post.title}</h3>
        {post.excerpt && (
          <div
            className="hidden flex-1 text-base text-[#00334d]/80 [&_p]:inline lg:line-clamp-3"
            dangerouslySetInnerHTML={{ __html: stripInlineGalleries(post.excerpt) }}
          />
        )}
        <span className="text-fluid-button mt-auto inline-flex w-fit items-center gap-2 font-bold uppercase text-[#00334d]">
          <span className="site-underline-grow">Citește mai mult</span>
          <ArrowRight className="h-4 w-4" />
        </span>
      </div>
    </Link>
  );
}
