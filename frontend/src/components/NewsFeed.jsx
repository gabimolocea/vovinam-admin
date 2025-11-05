import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  CalendarIcon, 
  UserIcon, 
  EyeIcon, 
  PlusIcon,
  ImageIcon,
  TagIcon,
  StarIcon
} from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card, CardContent, CardHeader } from './ui/card';
import AxiosInstance from './Axios';
import { useAuth } from '../contexts/AuthContext';
import NewsCarousel from './NewsCarousel';
import NewsSidebar from './NewsSidebar';

const NewsFeed = () => {
  const [news, setNews] = useState([]);
  const [featuredNews, setFeaturedNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    fetchNews();
  }, []);

  const fetchNews = async () => {
    try {
      const response = await AxiosInstance.get('landing/news/');
      const allNews = response.data.results || response.data;
      
      // Separate featured news for carousel, but keep all news in main feed
      const featured = allNews.filter(post => post.featured);
      
      setFeaturedNews(featured);
      setNews(allNews); // Show ALL news in the main feed
      setLoading(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch news');
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const truncateText = (text, maxLength = 150) => {
    if (!text) return '';
    const strippedText = text.replace(/<[^>]*>/g, '');
    return strippedText.length > maxLength 
      ? strippedText.substring(0, maxLength) + '...' 
      : strippedText;
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

  const handleCreateNews = () => {
    navigate('/news/create');
  };

  const handleViewNews = (slug) => {
    navigate(`/news/${slug}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-6">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white rounded-lg p-6 border border-gray-800 shadow-sm">
                <div className="h-6 bg-gray-200 rounded mb-4"></div>
                <div className="h-4 bg-gray-200 rounded mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-8xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <div className="text-red-700 text-center">
              <p className="text-lg font-medium mb-2">Error Loading News</p>
              <p className="text-sm text-gray-600">{error}</p>
              <Button 
                onClick={fetchNews} 
                className="mt-4 bg-blue-600 hover:bg-blue-700 text-white"
              >
                Try Again
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Featured News Carousel - Full Width */}
      {featuredNews.length > 0 && (
        <div className="mb-6">
          <NewsCarousel 
            featuredNews={featuredNews}
            onNewsClick={handleViewNews}
          />
        </div>
      )}

        {/* Two Column Layout */}
        <div className="flex gap-6">
          {/* Main Content */}
          <div className="flex-1">

        {/* News Grid */}
        {news.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-600 mb-4">
              <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
              </svg>
            </div>
            <p className="text-gray-600 text-lg">No news articles found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {news.map((post) => (
              <div key={post.id} className="bg-white border border-gray-300 rounded-md hover:border-gray-400 transition-colors cursor-pointer overflow-hidden">
                <div className="flex flex-col sm:flex-row">
                  {/* Vote Section - Hidden on mobile, visible on desktop */}
                  <div className="hidden sm:flex flex-col items-center p-2 bg-gray-50 border-r border-gray-200 min-w-[48px]">
                    <button className="text-gray-400 hover:text-orange-500 hover:bg-orange-50 rounded p-1 transition-colors">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                    <span className="text-xs font-bold text-gray-700 py-1">
                      {Math.floor(Math.random() * 1000)}
                    </span>
                    <button className="text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded p-1 transition-colors">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>

                  {/* Content Section */}
                  <div className="flex-1 p-3 sm:p-4">
                    <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                      {/* Mobile vote buttons - visible only on mobile */}
                      <div className="flex sm:hidden items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <button className="text-gray-400 hover:text-orange-500 hover:bg-orange-50 rounded p-1 transition-colors">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
                            </svg>
                          </button>
                          <span className="text-xs font-bold text-gray-700">
                            {Math.floor(Math.random() * 1000)}
                          </span>
                          <button className="text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded p-1 transition-colors">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      {/* Thumbnail - Always show, but responsive sizing */}
                      <div className="flex-shrink-0 order-2 sm:order-1">
                        {post.featured_image ? (
                          <div className="w-full sm:w-24 sm:h-16 h-48 rounded overflow-hidden bg-gray-100">
                            <img
                              src={post.featured_image}
                              alt={post.featured_image_alt || post.title}
                              className="w-full h-full object-cover hover:scale-105 transition-transform duration-200"
                            />
                          </div>
                        ) : (
                          <div className="w-full sm:w-24 sm:h-16 h-48 rounded bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                            <svg className="w-8 h-8 sm:w-6 sm:h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                        )}
                      </div>

                      {/* Post Content */}
                      <div className="flex-1 min-w-0 order-1 sm:order-2">
                        {/* Post Meta */}
                        <div className="flex items-center flex-wrap text-xs text-gray-500 mb-2">
                          <span className="text-orange-600 font-medium">r/News</span>
                          <span className="mx-1">•</span>
                          <span className="hidden sm:inline">Posted by </span>
                          <span>u/{post.author_name || 'admin'}</span>
                          <span className="mx-1">•</span>
                          <span>{formatTimeAgo(post.created_at)}</span>
                          {post.featured && (
                            <>
                              <span className="mx-1">•</span>
                              <Badge className="bg-orange-500 text-white text-xs px-1 py-0.5 rounded">
                                Pinned
                              </Badge>
                            </>
                          )}
                        </div>

                        {/* Post Title */}
                        <h3 
                          className="text-sm sm:text-base lg:text-lg font-medium text-gray-900 hover:text-blue-600 cursor-pointer mb-2 leading-tight"
                          onClick={() => handleViewNews(post.slug)}
                        >
                          {post.title}
                        </h3>

                        {/* Post Excerpt - Hide on mobile when there's an image to save space */}
                        {post.excerpt && (
                          <p className={`text-xs sm:text-sm text-gray-600 mb-3 line-clamp-2 ${post.featured_image ? 'hidden sm:block' : ''}`}>
                            {truncateText(post.excerpt, 150)}
                          </p>
                        )}

                        {/* Post Actions */}
                        <div className="flex items-center gap-2 sm:gap-4 text-xs text-gray-500">
                          <button 
                            className="flex items-center gap-1 hover:bg-gray-100 rounded px-2 py-1 transition-colors"
                            onClick={() => handleViewNews(post.slug)}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                            <span className="hidden sm:inline">{post.comment_count || 0} Comments</span>
                            <span className="sm:hidden">{post.comment_count || 0}</span>
                          </button>
                          
                          <button className="flex items-center gap-1 hover:bg-gray-100 rounded px-2 py-1 transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
                            </svg>
                            <span className="hidden sm:inline">Share</span>
                          </button>
                          
                          <button className="flex items-center gap-1 hover:bg-gray-100 rounded px-2 py-1 transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                            </svg>
                            <span className="hidden sm:inline">Save</span>
                          </button>

                          {post.tags && (
                            <div className="flex items-center gap-1 ml-auto">
                              {post.tags.split(',').slice(0, 2).map((tag, index) => (
                                <span key={index} className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs">
                                  {tag.trim()}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        }
          </div>

          {/* Right Sidebar */}
          <div className="hidden lg:block">
            <NewsSidebar />
          </div>
        </div>
      </div>
  );
};

export default NewsFeed;