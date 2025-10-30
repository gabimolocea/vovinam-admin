import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeftIcon, 
  SaveIcon, 
  EyeIcon, 
  ImageIcon, 
  TrashIcon,
  PlusIcon,
  TagIcon,
  GlobeIcon
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Switch } from './ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import AxiosInstance from './Axios';
import { useAuth } from '../contexts/AuthContext';

const CreateNews = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const fileInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  const [formData, setFormData] = useState({
    title: '',
    content: '',
    excerpt: '',
    featured_image: null,
    featured_image_alt: '',
    published: false,
    featured: false,
    tags: '',
    // SEO fields
    meta_title: '',
    meta_description: '',
    meta_keywords: '',
    canonical_url: '',
    robots_index: true,
    robots_follow: true
  });

  const [galleryImages, setGalleryImages] = useState([]);
  const [previewImage, setPreviewImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  // Check if user is admin
  React.useEffect(() => {
    if (!user?.is_admin) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }));
    }
  };

  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      setFormData(prev => ({ ...prev, featured_image: file }));
      const reader = new FileReader();
      reader.onload = (e) => setPreviewImage(e.target.result);
      reader.readAsDataURL(file);
    }
  };

  const handleGalleryUpload = (event) => {
    const files = Array.from(event.target.files);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        setGalleryImages(prev => [...prev, {
          file,
          preview: e.target.result,
          alt_text: '',
          caption: '',
          order: prev.length + 1
        }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeGalleryImage = (index) => {
    setGalleryImages(prev => prev.filter((_, i) => i !== index));
  };

  const updateGalleryImage = (index, field, value) => {
    setGalleryImages(prev => prev.map((img, i) => 
      i === index ? { ...img, [field]: value } : img
    ));
  };

  const generateSlug = (title) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9 -]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim('-');
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.title.trim()) {
      newErrors.title = 'Title is required';
    }
    
    if (!formData.content.trim()) {
      newErrors.content = 'Content is required';
    }
    
    if (formData.meta_title && formData.meta_title.length > 60) {
      newErrors.meta_title = 'Meta title should be 60 characters or less';
    }
    
    if (formData.meta_description && formData.meta_description.length > 160) {
      newErrors.meta_description = 'Meta description should be 160 characters or less';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    
    try {
      // Create FormData for multipart upload
      const submitData = new FormData();
      
      // Add all form fields
      Object.keys(formData).forEach(key => {
        if (key === 'featured_image' && formData[key] instanceof File) {
          submitData.append(key, formData[key]);
        } else if (formData[key] !== null && formData[key] !== '') {
          submitData.append(key, formData[key]);
        }
      });
      
      // Generate slug from title
      submitData.append('slug', generateSlug(formData.title));

      const response = await AxiosInstance.post('landing/news/', submitData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const newsPost = response.data;

      // Upload gallery images if any
      if (galleryImages.length > 0) {
        const galleryPromises = galleryImages.map(async (img, index) => {
          const galleryData = new FormData();
          galleryData.append('image', img.file);
          galleryData.append('alt_text', img.alt_text);
          galleryData.append('caption', img.caption);
          galleryData.append('order', index + 1);
          
          return AxiosInstance.post(`landing/news/${newsPost.id}/add_gallery_image/`, galleryData, {
            headers: {
              'Content-Type': 'multipart/form-data',
            },
          });
        });

        await Promise.all(galleryPromises);
      }

      navigate('/news');
    } catch (error) {
      console.error('Error creating news post:', error);
      if (error.response?.data) {
        setErrors(error.response.data);
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = () => {
    // You could implement a preview modal here
    console.log('Preview functionality not implemented yet');
  };

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
                <div>
                  <h1 className="text-lg font-bold text-gray-900">Create a post in r/News</h1>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={handlePreview}
                variant="outline"
                className="border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2 text-sm rounded-full"
              >
                Preview
              </Button>
              <Button 
                onClick={handleSubmit}
                disabled={loading}
                className="bg-orange-500 hover:bg-orange-600 text-white font-medium px-6 py-2 text-sm rounded-full"
              >
                {loading ? 'Posting...' : 'Post'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-4">
              {/* Basic Information */}
              <Card className="bg-white border border-gray-300 rounded-md">
                <CardHeader className="pb-3">
                  <CardTitle className="text-gray-900 text-lg">Post Content</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="title" className="text-gray-700">Title *</Label>
                    <Input
                      id="title"
                      value={formData.title}
                      onChange={(e) => handleInputChange('title', e.target.value)}
                      placeholder="Enter article title..."
                      className="bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500"
                    />
                    {errors.title && <p className="text-red-600 text-sm mt-1">{errors.title}</p>}
                  </div>

                  <div>
                    <Label htmlFor="excerpt" className="text-gray-700">Excerpt</Label>
                    <Textarea
                      id="excerpt"
                      value={formData.excerpt}
                      onChange={(e) => handleInputChange('excerpt', e.target.value)}
                      placeholder="Brief summary of the article..."
                      className="bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500 min-h-[100px]"
                    />
                  </div>

                  <div>
                    <Label htmlFor="content" className="text-gray-700">Content *</Label>
                    <Textarea
                      id="content"
                      value={formData.content}
                      onChange={(e) => handleInputChange('content', e.target.value)}
                      placeholder="Write your article content here..."
                      className="bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500 min-h-[300px]"
                    />
                    {errors.content && <p className="text-red-600 text-sm mt-1">{errors.content}</p>}
                  </div>

                  <div>
                    <Label htmlFor="tags" className="text-gray-700">Tags</Label>
                    <Input
                      id="tags"
                      value={formData.tags}
                      onChange={(e) => handleInputChange('tags', e.target.value)}
                      placeholder="sports, competition, news (comma separated)"
                      className="bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Gallery Section */}
              <Card className="bg-white border-gray-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-gray-900 flex items-center gap-2">
                    <ImageIcon className="h-5 w-5" />
                    Gallery Images
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <Button
                      type="button"
                      onClick={() => galleryInputRef.current?.click()}
                      variant="outline"
                      className="border-gray-300 text-gray-700 hover:bg-gray-50"
                    >
                      <PlusIcon className="h-4 w-4 mr-2" />
                      Add Gallery Images
                    </Button>
                    <input
                      ref={galleryInputRef}
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={handleGalleryUpload}
                      className="hidden"
                    />

                    {galleryImages.length > 0 && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {galleryImages.map((img, index) => (
                          <div key={index} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                            <div className="relative mb-3">
                              <img
                                src={img.preview}
                                alt={`Gallery ${index + 1}`}
                                className="w-full h-32 object-cover rounded"
                              />
                              <Button
                                type="button"
                                onClick={() => removeGalleryImage(index)}
                                size="sm"
                                variant="destructive"
                                className="absolute top-2 right-2"
                              >
                                <TrashIcon className="h-3 w-3" />
                              </Button>
                            </div>
                            <div className="space-y-2">
                              <Input
                                placeholder="Alt text"
                                value={img.alt_text}
                                onChange={(e) => updateGalleryImage(index, 'alt_text', e.target.value)}
                                className="bg-white border-gray-300 text-gray-900 text-sm"
                              />
                              <Input
                                placeholder="Caption (optional)"
                                value={img.caption}
                                onChange={(e) => updateGalleryImage(index, 'caption', e.target.value)}
                                className="bg-white border-gray-300 text-gray-900 text-sm"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Publish Settings */}
              <Card className="bg-white border-gray-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-gray-900">Publish Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="published" className="text-gray-700">Published</Label>
                    <Switch
                      id="published"
                      checked={formData.published}
                      onCheckedChange={(checked) => handleInputChange('published', checked)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="featured" className="text-gray-700">Featured</Label>
                    <Switch
                      id="featured"
                      checked={formData.featured}
                      onCheckedChange={(checked) => handleInputChange('featured', checked)}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Featured Image */}
              <Card className="bg-white border-gray-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-gray-900">Featured Image</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    variant="outline"
                    className="w-full border-gray-300 text-gray-700 hover:bg-gray-50"
                  >
                    <ImageIcon className="h-4 w-4 mr-2" />
                    {previewImage ? 'Change Image' : 'Upload Image'}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  
                  {previewImage && (
                    <div className="space-y-2">
                      <img
                        src={previewImage}
                        alt="Preview"
                        className="w-full h-40 object-cover rounded border border-gray-700"
                      />
                      <Input
                        placeholder="Alt text for image"
                        value={formData.featured_image_alt}
                        onChange={(e) => handleInputChange('featured_image_alt', e.target.value)}
                        className="bg-white border-gray-300 text-gray-900 text-sm"
                      />
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* SEO Settings */}
              <Card className="bg-white border-gray-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-gray-900 flex items-center gap-2">
                    <GlobeIcon className="h-5 w-5" />
                    SEO Settings
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="text-gray-700">Meta Title ({formData.meta_title.length}/60)</Label>
                    <Input
                      value={formData.meta_title}
                      onChange={(e) => handleInputChange('meta_title', e.target.value)}
                      placeholder="SEO title (60 chars max)"
                      className="bg-white border-gray-300 text-gray-900 text-sm"
                      maxLength={60}
                    />
                    {errors.meta_title && <p className="text-red-600 text-xs mt-1">{errors.meta_title}</p>}
                  </div>

                  <div>
                    <Label className="text-gray-700">Meta Description ({formData.meta_description.length}/160)</Label>
                    <Textarea
                      value={formData.meta_description}
                      onChange={(e) => handleInputChange('meta_description', e.target.value)}
                      placeholder="SEO description (160 chars max)"
                      className="bg-white border-gray-300 text-gray-900 text-sm min-h-[80px]"
                      maxLength={160}
                    />
                    {errors.meta_description && <p className="text-red-600 text-xs mt-1">{errors.meta_description}</p>}
                  </div>

                  <div>
                    <Label className="text-gray-700">Meta Keywords</Label>
                    <Input
                      value={formData.meta_keywords}
                      onChange={(e) => handleInputChange('meta_keywords', e.target.value)}
                      placeholder="keyword1, keyword2, keyword3"
                      className="bg-white border-gray-300 text-gray-900 text-sm"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label className="text-gray-700">Index Page</Label>
                    <Switch
                      checked={formData.robots_index}
                      onCheckedChange={(checked) => handleInputChange('robots_index', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label className="text-gray-700">Follow Links</Label>
                    <Switch
                      checked={formData.robots_follow}
                      onCheckedChange={(checked) => handleInputChange('robots_follow', checked)}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateNews;