import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Calendar, User, Star } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

const NewsCarousel = ({ featuredNews, onNewsClick }) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);

  // Auto-advance slides every 5 seconds
  useEffect(() => {
    if (!isAutoPlaying || !featuredNews || featuredNews.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % featuredNews.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [isAutoPlaying, featuredNews]);

  if (!featuredNews || featuredNews.length === 0) {
    return null;
  }

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % featuredNews.length);
    setIsAutoPlaying(false);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + featuredNews.length) % featuredNews.length);
    setIsAutoPlaying(false);
  };

  const goToSlide = (index) => {
    setCurrentSlide(index);
    setIsAutoPlaying(false);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const truncateText = (text, maxLength = 120) => {
    if (!text) return '';
    const strippedText = text.replace(/<[^>]*>/g, '');
    return strippedText.length > maxLength 
      ? strippedText.substring(0, maxLength) + '...' 
      : strippedText;
  };

  const currentNews = featuredNews[currentSlide];

  return (
    <div className="relative mb-6">
      <Card className="overflow-hidden border-2 border-orange-200 bg-gradient-to-r from-orange-50 to-red-50">
        <CardContent className="p-0">
          <div className="relative">
            {/* Featured News Content */}
            <div 
              className="relative min-h-[250px] sm:min-h-[300px] lg:min-h-[400px] bg-gradient-to-r from-black/60 to-black/40 flex items-end cursor-pointer transition-transform duration-300 hover:scale-[1.02]"
              style={{
                backgroundImage: currentNews.featured_image 
                  ? `url(${currentNews.featured_image})` 
                  : 'linear-gradient(135deg, #f97316, #ea580c)',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
              onClick={() => onNewsClick(currentNews.slug)}
            >
              {/* Overlay gradient */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent"></div>
              
              {/* Content */}
              <div className="relative z-10 p-4 sm:p-6 lg:p-8 text-white w-full">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
                  <Badge className="bg-orange-500 text-white px-3 py-1 text-xs font-medium w-fit">
                    <Star className="w-3 h-3 mr-1" />
                    Featured
                  </Badge>
                  <div className="flex items-center gap-2 text-orange-200 text-xs">
                    <Calendar className="w-3 h-3" />
                    <span>{formatDate(currentNews.created_at)}</span>
                  </div>
                </div>
                
                <h2 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold mb-2 sm:mb-3 leading-tight">
                  {currentNews.title}
                </h2>
                
                <p className="text-gray-200 text-xs sm:text-sm lg:text-base mb-3 sm:mb-4 leading-relaxed line-clamp-2">
                  {truncateText(currentNews.excerpt, 150)}
                </p>
                
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-gray-300">
                    <User className="w-3 h-3" />
                    <span>By {currentNews.author_name || 'Admin'}</span>
                  </div>
                  
                  <Button 
                    onClick={(e) => {
                      e.stopPropagation();
                      onNewsClick(currentNews.slug);
                    }}
                    className="bg-orange-500 hover:bg-orange-600 text-white text-xs sm:text-sm px-4 py-2 rounded-full transition-all duration-200 transform hover:scale-105 w-fit"
                  >
                    Read More
                  </Button>
                </div>
              </div>
            </div>

            {/* Navigation Arrows */}
            {featuredNews.length > 1 && (
              <>
                <Button
                  onClick={prevSlide}
                  variant="ghost"
                  size="sm"
                  className="absolute left-4 top-1/2 transform -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </Button>
                
                <Button
                  onClick={nextSlide}
                  variant="ghost"
                  size="sm"
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </Button>
              </>
            )}
          </div>

          {/* Slide Indicators */}
          {featuredNews.length > 1 && (
            <div className="flex justify-center items-center gap-2 p-4 bg-white">
              {featuredNews.map((_, index) => (
                <button
                  key={index}
                  onClick={() => goToSlide(index)}
                  className={`w-2 h-2 rounded-full transition-all duration-300 ${
                    index === currentSlide 
                      ? 'bg-orange-500 w-8' 
                      : 'bg-gray-300 hover:bg-gray-400'
                  }`}
                />
              ))}
              
              {/* Auto-play indicator */}
              <div className="ml-4 flex items-center gap-2 text-xs text-gray-500">
                <div className={`w-2 h-2 rounded-full ${isAutoPlaying ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></div>
                <span>{isAutoPlaying ? 'Auto-playing' : 'Paused'}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default NewsCarousel;