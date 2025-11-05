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
import NewsSidebar from './NewsSidebar';

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
      // Search for the article by slug using the updated backend search
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
    <>
      {/* Main Layout Container */}
      <div className="max-w-7xl mx-auto flex gap-8">
        {/* Main Content Column */}
        <div className="flex-1 max-w-4xl">
          {/* Header - matching content width */}
          <div className="py-4">
            <div className="flex items-center justify-between">
              <Button 
                onClick={() => navigate('/news')} 
                variant="ghost" 
                className="text-gray-600 hover:text-gray-900 hover:bg-gray-100 px-3 py-2"
              >
                <ArrowLeftIcon className="h-4 w-4 mr-2" />
                Back to News
              </Button>
              
              {user?.is_admin && (
                <Button
                  onClick={handleEdit}
                  variant="outline" 
                  size="sm"
                  className="border-blue-300 text-blue-700 hover:bg-blue-50"
                >
                  <Edit3Icon className="h-4 w-4 mr-2" />
                  Edit
                </Button>
              )}
            </div>
          </div>

          {/* Article Title */}
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 leading-tight mb-4">
            {article.title}
          </h1>

          {/* Article Meta - moved below title */}
          <div className="mb-8">
            <div className="flex items-center text-sm text-gray-500">
              <span>By {article.author_name || 'admin'}</span>
              <span className="mx-2">•</span>
              <span>{formatDate(article.created_at)}</span>
              {article.featured && (
                <>
                  <span className="mx-2">•</span>
                  <Badge className="bg-blue-500 text-white text-xs">
                    Featured
                  </Badge>
                </>
              )}
              {!article.published && user?.is_admin && (
                <>
                  <span className="mx-2">•</span>
                  <Badge variant="outline" className="border-orange-500 text-orange-600 text-xs">
                    Draft
                  </Badge>
                </>
              )}
              <div className="flex items-center gap-4 ml-auto">
                <div className="flex items-center gap-1 text-gray-400 hover:text-gray-600 cursor-pointer transition-colors" onClick={handleShare}>
                  <ShareIcon className="h-5 w-5" />
                  <span className="text-sm">Share</span>
                </div>
                <div className="flex items-center gap-1 text-gray-400 hover:text-gray-600 cursor-pointer transition-colors">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                  <span className="text-sm">Save</span>
                </div>
              </div>
            </div>
          </div>

        {/* Featured Image */}
        {article.featured_image && (
          <div className="mb-8">
            <img
              src={article.featured_image}
              alt={article.featured_image_alt || article.title}
              className="w-full max-h-96 object-cover rounded-lg"
            />
            {article.featured_image_alt && (
              <p className="text-sm text-gray-500 mt-2 italic text-center">
                {article.featured_image_alt}
              </p>
            )}
          </div>
        )}

        {/* Article Excerpt */}
        {article.excerpt && (
          <div className="mb-8">
            <p className="text-lg text-gray-700 font-medium leading-relaxed">
              {article.excerpt.replace(/<[^>]*>/g, '')}
            </p>
          </div>
        )}

        {/* Article Content - Render as written in admin */}
        <div 
          className="prose prose-lg prose-gray max-w-none"
          dangerouslySetInnerHTML={{ 
            __html: article.content
          }}
        />

        {/* Tags */}
        {article.tags && (
          <div className="mt-8 pt-6 border-t border-gray-200">
            <div className="flex items-center gap-2">
              <TagIcon className="h-4 w-4 text-gray-500" />
              <span className="text-sm text-gray-500 mr-3">Tags:</span>
              {article.tags.split(',').map((tag, index) => (
                <Badge key={index} variant="secondary" className="text-xs">
                  {tag.trim()}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Gallery */}
        {article.gallery_images && article.gallery_images.length > 0 && (
          <div className="mt-8">
            <h3 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
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
                    className="w-full h-32 object-cover rounded-lg hover:shadow-lg transition-shadow"
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                    <ImageIcon className="h-6 w-6 text-white" />
                  </div>
                  {image.caption && (
                    <p className="text-sm text-gray-600 mt-2 truncate">
                      {image.caption}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SEO Meta Info (for admins) */}
        {user?.is_admin && (article.meta_title || article.meta_description) && (
          <div className="mt-8 p-4 bg-gray-50 rounded-lg">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">SEO Information</h3>
            <div className="space-y-2 text-sm">
              {article.meta_title && (
                <div>
                  <span className="font-medium text-gray-600">Meta Title: </span>
                  <span className="text-gray-900">{article.meta_title}</span>
                </div>
              )}
              {article.meta_description && (
                <div>
                  <span className="font-medium text-gray-600">Meta Description: </span>
                  <span className="text-gray-900">{article.meta_description}</span>
                </div>
              )}
              {article.meta_keywords && (
                <div>
                  <span className="font-medium text-gray-600">Keywords: </span>
                  <span className="text-gray-900">{article.meta_keywords}</span>
                </div>
              )}
            </div>
          </div>
        )}

          {/* Comments Section */}
          <div className="mt-12">
            <NewsComments 
              newsPostId={article.id} 
              newsPostSlug={article.slug} 
            />
          </div>
        </div>

        {/* Right Sidebar - Now outside main content area */}
        <div className="hidden lg:block lg:w-80">
          <div className="sticky top-4">
            <NewsSidebar />
          </div>
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
    </>
  );
};

export default NewsDetail;