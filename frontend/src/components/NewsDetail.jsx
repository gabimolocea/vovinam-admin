import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeftIcon, 
  CalendarIcon, 
  UserIcon, 
  TagIcon,
  ShareIcon,
  Edit3Icon,
  StarIcon,
  ImageIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  XIcon
} from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card, CardContent } from './ui/card';
import AxiosInstance from './Axios';
import { useAuth } from '../contexts/AuthContext';
import NewsComments from './NewsComments';

const NewsDetail = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [galleryModalOpen, setGalleryModalOpen] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    fetchArticle();
  }, [slug]);

  const fetchArticle = async () => {
    try {
      const response = await AxiosInstance.get(`landing/news/?search=${slug}`);
      const articles = response.data.results || response.data;
      const foundArticle = articles.find(article => article.slug === slug);
      
      if (!foundArticle) {
        setError('Article not found');
        setLoading(false);
        return;
      }

      // Fetch full article details
      const detailResponse = await AxiosInstance.get(`landing/news/${foundArticle.id}/`);
      setArticle(detailResponse.data);
      setLoading(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch article');
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatTimeAgo = (dateString) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffInMinutes = Math.floor((now - date) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 30) return `${diffInDays}d ago`;
    
    const diffInMonths = Math.floor(diffInDays / 30);
    return `${diffInMonths}mo ago`;
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: article.title,
          text: article.excerpt || article.title,
          url: window.location.href,
        });
      } catch (err) {
        console.log('Error sharing:', err);
      }
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(window.location.href);
      // You could show a toast notification here
    }
  };

  const handleEdit = () => {
    navigate(`/news/edit/${article.id}`);
  };

  const openGallery = (index) => {
    setCurrentImageIndex(index);
    setGalleryModalOpen(true);
  };

  const closeGallery = () => {
    setGalleryModalOpen(false);
  };

  const nextImage = () => {
    setCurrentImageIndex((prev) => 
      prev < article.gallery_images.length - 1 ? prev + 1 : 0
    );
  };

  const prevImage = () => {
    setCurrentImageIndex((prev) => 
      prev > 0 ? prev - 1 : article.gallery_images.length - 1
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-200 rounded w-1/4"></div>
            <div className="h-12 bg-gray-200 rounded w-3/4"></div>
            <div className="h-64 bg-gray-200 rounded"></div>
            <div className="space-y-3">
              <div className="h-4 bg-gray-200 rounded"></div>
              <div className="h-4 bg-gray-200 rounded w-5/6"></div>
              <div className="h-4 bg-gray-200 rounded w-4/6"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <div className="text-red-700 text-center">
              <p className="text-lg font-medium mb-2">Article Not Found</p>
              <p className="text-sm text-gray-600 mb-4">{error}</p>
              <Button 
                onClick={() => navigate('/news')} 
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                Back to News
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header - Reddit style */}
      <div className="bg-white border-b border-gray-300">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button 
                onClick={() => navigate('/news')} 
                variant="ghost" 
                className="text-gray-600 hover:text-gray-900 hover:bg-gray-100 px-2 py-1 text-sm"
              >
                <ArrowLeftIcon className="h-4 w-4 mr-1" />
                Back
              </Button>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center">
                  <span className="text-white font-bold text-sm">N</span>
                </div>
                <span className="text-lg font-bold text-gray-900">r/News</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleShare}
                variant="outline"
                size="sm"
                className="border-gray-300 text-gray-700 hover:bg-gray-50 px-3 py-1 text-xs rounded-full"
              >
                <ShareIcon className="h-3 w-3 mr-1" />
                Share
              </Button>
              {user?.is_admin && (
                <Button
                  onClick={handleEdit}
                  variant="outline"
                  size="sm"
                  className="border-gray-600 text-gray-300 hover:bg-gray-800"
                >
                  <Edit3Icon className="h-4 w-4 mr-2" />
                  Edit
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-4">
        {/* Reddit-style post container */}
        <div className="bg-white border border-gray-300 rounded-md">
          <div className="flex">
            {/* Vote Section */}
            <div className="flex flex-col items-center p-3 bg-gray-50 border-r border-gray-200 min-w-[48px]">
              <button className="text-gray-400 hover:text-orange-500 hover:bg-orange-50 rounded p-1">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
                </svg>
              </button>
              <span className="text-sm font-bold text-gray-700 py-2">
                {Math.floor(Math.random() * 2000)}
              </span>
              <button className="text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded p-1">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            {/* Content Section */}
            <div className="flex-1 p-4">
              {/* Post Meta */}
              <div className="flex items-center text-xs text-gray-500 mb-3">
                <span className="font-medium text-gray-900">r/News</span>
                <span className="mx-1">•</span>
                <span>Posted by u/{article.author_name || 'admin'}</span>
                <span className="mx-1">•</span>
                <span>{formatTimeAgo(article.created_at)}</span>
                {article.featured && (
                  <>
                    <span className="mx-1">•</span>
                    <Badge className="bg-orange-500 text-white text-xs px-2 py-0.5 rounded">
                      Pinned
                    </Badge>
                  </>
                )}
                {!article.published && user?.is_admin && (
                  <>
                    <span className="mx-1">•</span>
                    <Badge variant="outline" className="border-orange-500 text-orange-600 text-xs px-2 py-0.5">
                      Draft
                    </Badge>
                  </>
                )}
              </div>

              {/* Post Title */}
              <h1 className="text-xl md:text-2xl font-medium text-gray-900 mb-4 leading-tight">
                {article.title}
              </h1>
            </div>
          </div>
        </div>

        {/* Content continuation within the Reddit-style container */}
        <div className="bg-white border border-gray-300 rounded-md mt-4">
          <div className="p-4">
            {/* Featured Image */}
            {article.featured_image && (
              <div className="mb-6">
                <img
                  src={article.featured_image}
                  alt={article.featured_image_alt || article.title}
                  className="w-full max-h-96 object-cover rounded"
                />
                {article.featured_image_alt && (
                  <p className="text-sm text-gray-500 mt-2 italic">
                    {article.featured_image_alt}
                  </p>
                )}
              </div>
            )}

            {/* Article Excerpt */}
            {article.excerpt && (
              <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded">
                <p className="text-gray-700 italic">
                  {article.excerpt.replace(/<[^>]*>/g, '')}
                </p>
              </div>
            )}

            {/* Article Content */}
            <div 
              className="prose prose-gray max-w-none mb-6"
              style={{
                color: '#374151',
                lineHeight: '1.7'
              }}
              dangerouslySetInnerHTML={{ 
                __html: article.content.replace(/<[^>]*>/g, (match) => {
                  if (match.match(/<\/?[biu]>/)) return match;
                  if (match.match(/<\/?p>/)) return match;
                  if (match.match(/<br\s*\/?>/)) return match;
                  return '';
                })
              }}
            />

            {/* Post Actions - Reddit style */}
            <div className="flex items-center gap-6 text-xs text-gray-500 pt-4 border-t border-gray-200">
              <button className="flex items-center gap-1 hover:bg-gray-100 rounded px-2 py-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <span>View Comments</span>
              </button>
              
              <button 
                onClick={handleShare}
                className="flex items-center gap-1 hover:bg-gray-100 rounded px-2 py-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
                </svg>
                <span>Share</span>
              </button>

              <button className="flex items-center gap-1 hover:bg-gray-100 rounded px-2 py-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
                <span>Save</span>
              </button>

              {article.tags && (
                <div className="flex items-center gap-2 ml-auto">
                  {article.tags.split(',').map((tag, index) => (
                    <span key={index} className="bg-gray-100 text-gray-600 px-2 py-1 rounded-full text-xs">
                      {tag.trim()}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Gallery */}
        {article.gallery_images && article.gallery_images.length > 0 && (
          <div className="bg-white border border-gray-300 rounded-md mt-4">
            <div className="p-4">
              <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
                <ImageIcon className="h-5 w-5" />
                Gallery ({article.gallery_images.length} images)
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {article.gallery_images.map((image, index) => (
                  <div
                    key={image.id}
                    className="relative group cursor-pointer"
                    onClick={() => openGallery(index)}
                  >
                    <img
                      src={image.image}
                      alt={image.alt_text || `Gallery image ${index + 1}`}
                      className="w-full h-32 object-cover rounded border border-gray-300 group-hover:border-orange-500 transition-colors"
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded flex items-center justify-center">
                      <ImageIcon className="h-6 w-6 text-white" />
                    </div>
                    {image.caption && (
                      <p className="text-sm text-gray-600 mt-1 truncate">
                        {image.caption}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* SEO Meta Info (for admins) */}
        {user?.is_admin && (article.meta_title || article.meta_description) && (
          <div className="bg-white border border-gray-300 rounded-md mt-4">
            <div className="p-4">
              <h3 className="text-lg font-medium text-gray-900 mb-4">SEO Information</h3>
              <div className="space-y-3 text-sm">
                {article.meta_title && (
                  <div>
                    <span className="text-gray-600">Meta Title: </span>
                    <span className="text-gray-900">{article.meta_title}</span>
                  </div>
                )}
                {article.meta_description && (
                  <div>
                    <span className="text-gray-600">Meta Description: </span>
                    <span className="text-gray-900">{article.meta_description}</span>
                  </div>
                )}
                {article.meta_keywords && (
                  <div>
                    <span className="text-gray-600">Keywords: </span>
                    <span className="text-gray-900">{article.meta_keywords}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Comments Section */}
        <div className="mt-6">
          <NewsComments 
            newsPostId={article.id} 
            newsPostSlug={article.slug} 
          />
        </div>
      </div>

      {/* Gallery Modal */}
      {galleryModalOpen && article.gallery_images && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
          <div className="relative max-w-4xl max-h-full">
            <Button
              onClick={closeGallery}
              size="sm"
              variant="ghost"
              className="absolute top-4 right-4 z-10 text-white hover:bg-white/20"
            >
              <XIcon className="h-5 w-5" />
            </Button>
            
            <img
              src={article.gallery_images[currentImageIndex]?.image}
              alt={article.gallery_images[currentImageIndex]?.alt_text}
              className="max-w-full max-h-[80vh] object-contain rounded"
            />
            
            {article.gallery_images.length > 1 && (
              <>
                <Button
                  onClick={prevImage}
                  size="sm"
                  variant="ghost"
                  className="absolute left-4 top-1/2 transform -translate-y-1/2 text-white hover:bg-white/20"
                >
                  <ChevronLeftIcon className="h-6 w-6" />
                </Button>
                <Button
                  onClick={nextImage}
                  size="sm"
                  variant="ghost"
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 text-white hover:bg-white/20"
                >
                  <ChevronRightIcon className="h-6 w-6" />
                </Button>
              </>
            )}
            
            {article.gallery_images[currentImageIndex]?.caption && (
              <div className="absolute bottom-4 left-4 right-4 bg-black/70 rounded p-3">
                <p className="text-white text-sm text-center">
                  {article.gallery_images[currentImageIndex].caption}
                </p>
              </div>
            )}
            
            <div className="absolute top-4 left-4 bg-black/70 rounded px-3 py-1">
              <span className="text-white text-sm">
                {currentImageIndex + 1} / {article.gallery_images.length}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NewsDetail;