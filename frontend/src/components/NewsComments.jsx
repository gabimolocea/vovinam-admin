import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Card, CardContent } from './ui/card';
import { Avatar, AvatarFallback } from './ui/avatar';
import { MessageCircle, Reply, Edit, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import AxiosInstance from './Axios';
import { useAuth } from '../contexts/AuthContext';

const NewsComments = ({ newsPostId, newsPostSlug }) => {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyContent, setReplyContent] = useState('');
  const [editingComment, setEditingComment] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    fetchComments();
  }, [newsPostId]);

  const fetchComments = async () => {
    try {
      const response = await AxiosInstance.get(`landing/news-comments/?news_post=${newsPostId}`);
      // Group comments by parent (top-level comments first)
      const allComments = response.data.results || response.data;
      const topLevelComments = allComments.filter(comment => !comment.parent);
      setComments(topLevelComments);
      setLoading(false);
    } catch (err) {
      setError('Failed to load comments');
      setLoading(false);
    }
  };

  const handleSubmitComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    setSubmitting(true);
    try {
      const response = await AxiosInstance.post('landing/news-comments/', {
        news_post: newsPostId,
        content: newComment.trim()
      });
      
      setComments([...comments, response.data]);
      setNewComment('');
      setError(null);
    } catch (err) {
      setError('Failed to submit comment. Please try again.');
    }
    setSubmitting(false);
  };

  const handleSubmitReply = async (parentId) => {
    if (!replyContent.trim()) return;

    setSubmitting(true);
    try {
      const response = await AxiosInstance.post('landing/news-comments/', {
        news_post: newsPostId,
        content: replyContent.trim(),
        parent: parentId
      });
      
      // Add reply to the parent comment
      setComments(comments.map(comment => 
        comment.id === parentId 
          ? { ...comment, replies: [...(comment.replies || []), response.data] }
          : comment
      ));
      
      setReplyContent('');
      setReplyingTo(null);
      setError(null);
    } catch (err) {
      setError('Failed to submit reply. Please try again.');
    }
    setSubmitting(false);
  };

  const handleEditComment = async (commentId) => {
    if (!editContent.trim()) return;

    setSubmitting(true);
    try {
      const response = await AxiosInstance.patch(`landing/news-comments/${commentId}/`, {
        content: editContent.trim()
      });
      
      // Update the comment in the list
      setComments(comments.map(comment => 
        comment.id === commentId 
          ? response.data
          : {
              ...comment,
              replies: comment.replies?.map(reply => 
                reply.id === commentId ? response.data : reply
              )
            }
      ));
      
      setEditingComment(null);
      setEditContent('');
      setError(null);
    } catch (err) {
      setError('Failed to update comment. Please try again.');
    }
    setSubmitting(false);
  };

  const handleDeleteComment = async (commentId) => {
    if (!window.confirm('Are you sure you want to delete this comment?')) return;

    try {
      await AxiosInstance.delete(`landing/news-comments/${commentId}/`);
      
      // Remove comment from the list
      setComments(comments.filter(comment => {
        if (comment.id === commentId) return false;
        if (comment.replies) {
          comment.replies = comment.replies.filter(reply => reply.id !== commentId);
        }
        return true;
      }));
      
      setError(null);
    } catch (err) {
      setError('Failed to delete comment. Please try again.');
    }
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

  const CommentItem = ({ comment, isReply = false }) => (
    <div className={`${isReply ? 'ml-8 border-l-2 border-gray-200 pl-4' : ''} mb-4`}>
      <Card className="bg-white border border-gray-200">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Avatar className="w-8 h-8">
              <AvatarFallback className="bg-orange-100 text-orange-600 text-xs font-medium">
                {comment.author_name ? comment.author_name.charAt(0).toUpperCase() : 'U'}
              </AvatarFallback>
            </Avatar>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-medium text-sm text-gray-900">
                  u/{comment.author_username}
                </span>
                <span className="text-xs text-gray-500">•</span>
                <span className="text-xs text-gray-500">
                  {formatTimeAgo(comment.created_at)}
                </span>
                {comment.updated_at !== comment.created_at && (
                  <>
                    <span className="text-xs text-gray-500">•</span>
                    <span className="text-xs text-gray-500 italic">edited</span>
                  </>
                )}
              </div>
              
              {editingComment === comment.id ? (
                <div className="space-y-2">
                  <Textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    placeholder="Edit your comment..."
                    className="min-h-[80px] text-sm"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleEditComment(comment.id)}
                      disabled={submitting || !editContent.trim()}
                      className="bg-orange-500 hover:bg-orange-600 text-white text-xs px-3 py-1"
                    >
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingComment(null);
                        setEditContent('');
                      }}
                      className="text-xs px-3 py-1"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-800 mb-3 whitespace-pre-wrap">
                    {comment.content}
                  </p>
                  
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <div className="flex items-center gap-1">
                      <button className="hover:text-orange-500 hover:bg-orange-50 p-1 rounded transition-colors">
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <span className="font-medium text-gray-700">
                        {Math.floor(Math.random() * 20)}
                      </span>
                      <button className="hover:text-blue-500 hover:bg-blue-50 p-1 rounded transition-colors">
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    </div>
                    
                    {user && !isReply && (
                      <button
                        onClick={() => {
                          setReplyingTo(comment.id);
                          setReplyContent('');
                        }}
                        className="flex items-center gap-1 hover:text-blue-600 hover:bg-blue-50 px-2 py-1 rounded transition-colors"
                      >
                        <Reply className="w-3 h-3" />
                        Reply
                      </button>
                    )}
                    
                    {user && comment.can_edit && (
                      <>
                        <button
                          onClick={() => {
                            setEditingComment(comment.id);
                            setEditContent(comment.content);
                          }}
                          className="flex items-center gap-1 hover:text-yellow-600 hover:bg-yellow-50 px-2 py-1 rounded transition-colors"
                        >
                          <Edit className="w-3 h-3" />
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteComment(comment.id)}
                          className="flex items-center gap-1 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
              
              {/* Reply Form */}
              {replyingTo === comment.id && (
                <div className="mt-3 space-y-2">
                  <Textarea
                    value={replyContent}
                    onChange={(e) => setReplyContent(e.target.value)}
                    placeholder="Write a reply..."
                    className="min-h-[80px] text-sm"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleSubmitReply(comment.id)}
                      disabled={submitting || !replyContent.trim()}
                      className="bg-orange-500 hover:bg-orange-600 text-white text-xs px-3 py-1"
                    >
                      Reply
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setReplyingTo(null);
                        setReplyContent('');
                      }}
                      className="text-xs px-3 py-1"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Render Replies */}
      {comment.replies && comment.replies.length > 0 && (
        <div className="mt-3">
          {comment.replies.map((reply) => (
            <CommentItem key={reply.id} comment={reply} isReply={true} />
          ))}
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-1/4"></div>
          <div className="space-y-3">
            <div className="h-12 bg-gray-200 rounded"></div>
            <div className="h-12 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6">
      <div className="flex items-center gap-2 mb-6">
        <MessageCircle className="w-5 h-5 text-orange-500" />
        <h3 className="text-lg font-semibold text-gray-900">
          Comments ({comments.length})
        </h3>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {/* Comment Form */}
      {user ? (
        <form onSubmit={handleSubmitComment} className="mb-6">
          <div className="flex items-start gap-3">
            <Avatar className="w-8 h-8">
              <AvatarFallback className="bg-orange-100 text-orange-600 text-xs font-medium">
                {user.username ? user.username.charAt(0).toUpperCase() : 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-3">
              <Textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="What are your thoughts?"
                className="min-h-[100px] text-sm resize-none"
              />
              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={submitting || !newComment.trim()}
                  className="bg-orange-500 hover:bg-orange-600 text-white text-sm px-4 py-2"
                >
                  {submitting ? 'Posting...' : 'Comment'}
                </Button>
              </div>
            </div>
          </div>
        </form>
      ) : (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6 text-center">
          <p className="text-gray-600 text-sm mb-3">
            Please log in to join the discussion
          </p>
          <Button
            onClick={() => window.location.href = '/login'}
            className="bg-orange-500 hover:bg-orange-600 text-white text-sm px-4 py-2"
          >
            Log In
          </Button>
        </div>
      )}

      {/* Comments List */}
      {comments.length === 0 ? (
        <div className="text-center py-8">
          <MessageCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">
            No comments yet. Be the first to share your thoughts!
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {comments.map((comment) => (
            <CommentItem key={comment.id} comment={comment} />
          ))}
        </div>
      )}
    </div>
  );
};

export default NewsComments;