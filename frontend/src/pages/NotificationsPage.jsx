import React, { useState, useEffect } from 'react';
import { useNotifications } from '../contexts/NotificationContext';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { CheckIcon, RefreshCw } from 'lucide-react';

const NotificationsPage = () => {
  const {
    notifications,
    unreadCount,
    loading,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    markSelectedAsRead,
  } = useNotifications();

  const [selectedNotifications, setSelectedNotifications] = useState([]);
  const [filter, setFilter] = useState('all'); // 'all', 'unread', 'read'

  const filteredNotifications = notifications.filter(notification => {
    switch (filter) {
      case 'unread':
        return !notification.is_read;
      case 'read':
        return notification.is_read;
      default:
        return true;
    }
  });

  useEffect(() => setSelectedNotifications([]), [filter]);

  const handleSelectNotification = (notificationId) => {
    setSelectedNotifications(prev => prev.includes(notificationId) ? prev.filter(id => id !== notificationId) : [...prev, notificationId]);
  };

  const handleSelectAll = () => {
    if (selectedNotifications.length === filteredNotifications.length) {
      setSelectedNotifications([]);
    } else {
      setSelectedNotifications(filteredNotifications.map(n => n.id));
    }
  };

  const handleMarkSelectedAsRead = async () => {
    if (selectedNotifications.length > 0) {
      await markSelectedAsRead(selectedNotifications);
      setSelectedNotifications([]);
    }
  };

  const handleNotificationClick = async (notification) => {
    if (!notification.is_read) await markAsRead(notification.id);
  };

  const formatNotificationType = (type) => (type || '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  const formatTimeAgo = (dateString) => {
    if (!dateString) return '';
    const now = new Date();
    const notificationDate = new Date(dateString);
    const diffInSeconds = Math.floor((now - notificationDate) / 1000);
    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'result_approved': return '🎉';
      case 'result_rejected': return '❌';
      case 'result_revision_required': return '🔄';
      case 'result_submitted': return '📋';
      case 'competition_created': return '🏆';
      case 'competition_updated': return '📢';
      case 'system_announcement': return '📣';
      default: return '📋';
    }
  };

  return (
    <div className="max-w-4xl mx-auto my-8 space-y-4 px-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Notifications</h1>
        {unreadCount > 0 && <Badge variant="destructive">{unreadCount} unread</Badge>}
      </div>

      <Card>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <input type="checkbox" checked={selectedNotifications.length === filteredNotifications.length && filteredNotifications.length > 0} onChange={handleSelectAll} className="h-4 w-4" aria-label="Select all notifications" />
              <div className="text-sm text-gray-600">{selectedNotifications.length > 0 ? `${selectedNotifications.length} selected` : `${filteredNotifications.length} notifications`}</div>
            </div>

            <div className="flex items-center gap-2">
              <button className={`px-3 py-1 rounded ${filter==='all' ? 'bg-gray-900 text-white' : 'border'} text-sm`} onClick={() => setFilter('all')}>All ({notifications.length})</button>
              <button className={`px-3 py-1 rounded ${filter==='unread' ? 'bg-gray-900 text-white' : 'border'} text-sm`} onClick={() => setFilter('unread')}>Unread ({unreadCount})</button>
              <button className={`px-3 py-1 rounded ${filter==='read' ? 'bg-gray-900 text-white' : 'border'} text-sm`} onClick={() => setFilter('read')}>Read ({notifications.length - unreadCount})</button>

              <div className="w-px h-6 bg-gray-200" aria-hidden="true" />

              {selectedNotifications.length > 0 && (
                <Button variant="ghost" size="sm" onClick={handleMarkSelectedAsRead}>
                  <CheckIcon className="h-4 w-4 mr-2" />
                  Mark selected
                </Button>
              )}

              {unreadCount > 0 && (
                <Button variant="ghost" size="sm" onClick={markAllAsRead}>Mark all read</Button>
              )}

              <Button variant="ghost" size="sm" onClick={fetchNotifications}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {filteredNotifications.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <div className="text-2xl mb-2">🔔</div>
            <div className="text-lg text-gray-600 mb-2">No notifications found</div>
            <div className="text-sm text-gray-500">{filter === 'unread' ? "You're all caught up! No unread notifications." : filter === 'read' ? "No read notifications yet." : "You don't have any notifications yet."}</div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredNotifications.map((notification) => (
            <div key={notification.id} onClick={() => handleNotificationClick(notification)} className={`p-4 rounded border ${!notification.is_read ? 'bg-blue-50' : 'bg-white'}`}>
              <div className="flex items-start gap-3">
                <input type="checkbox" checked={selectedNotifications.includes(notification.id)} onChange={(e) => { e.stopPropagation(); handleSelectNotification(notification.id); }} className="h-4 w-4 mt-1" aria-label={`Select notification ${notification.id}`} />

                <div className="text-lg flex-shrink-0">{getNotificationIcon(notification.notification_type)}</div>

                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className={`text-sm ${!notification.is_read ? 'font-semibold' : ''}`}>{notification.title}</h3>
                    {!notification.is_read && <div className="w-2 h-2 bg-blue-600 rounded-full" />}
                  </div>

                  <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{notification.message}</p>

                  <div className="flex items-center gap-3 mt-3">
                    <Badge variant="outline">{formatNotificationType(notification.notification_type)}</Badge>
                    <div className="text-xs text-gray-500">{formatTimeAgo(notification.created_at)}</div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default NotificationsPage;