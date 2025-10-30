import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, CheckCheck } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

import { useNotifications } from '../contexts/NotificationContext';

const NotificationBellConverted = () => {
  const navigate = useNavigate();
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead } = useNotifications();

  const handleNotificationClick = async (notification) => {
    if (!notification.is_read) {
      await markAsRead(notification.id);
    }
    // You can add navigation logic here based on notification type
  };

  const handleMarkAllRead = async () => {
    await markAllAsRead();
  };

  const handleViewAllNotifications = () => {
    navigate('/notifications');
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'result_approved':
        return '🎉';
      case 'result_rejected':
        return '❌';
      case 'result_revision_required':
        return '🔄';
      case 'result_submitted':
        return '📋';
      case 'competition_created':
        return '🏆';
      case 'competition_updated':
        return '📢';
      case 'system_announcement':
        return '📣';
      default:
        return '📋';
    }
  };

  const getNotificationVariant = (type) => {
    switch (type) {
      case 'result_approved':
        return 'default';
      case 'result_rejected':
        return 'destructive';
      case 'result_revision_required':
        return 'secondary';
      case 'result_submitted':
        return 'outline';
      case 'competition_created':
        return 'default';
      case 'competition_updated':
        return 'secondary';
      case 'system_announcement':
        return 'outline';
      default:
        return 'outline';
    }
  };

  const formatTimeAgo = (dateString) => {
    const now = new Date();
    const notificationDate = new Date(dateString);
    const diffInSeconds = Math.floor((now - notificationDate) / 1000);

    if (diffInSeconds < 60) {
      return 'Just now';
    } else if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return `${minutes}m ago`;
    } else if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600);
      return `${hours}h ago`;
    } else {
      const days = Math.floor(diffInSeconds / 86400);
      return `${days}d ago`;
    }
  };

  // Get recent notifications (max 5 for dropdown)
  const recentNotifications = notifications.slice(0, 5);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80" align="end">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllRead}
              className="text-xs"
            >
              <CheckCheck className="h-3 w-3 mr-1" />
              Mark all read
            </Button>
          )}
        </div>

        {loading ? (
          <div className="p-4 text-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        ) : recentNotifications.length > 0 ? (
          <div className="max-h-96 overflow-y-auto">
            <div className="space-y-1">
              {recentNotifications.map((notification) => (
                <DropdownMenuItem
                  key={notification.id}
                  className="p-0 cursor-pointer"
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className={`w-full p-3 flex items-start gap-3 ${!notification.is_read ? 'bg-blue-50' : ''}`}>
                    <div className="text-lg flex-shrink-0">
                      {getNotificationIcon(notification.type || notification.notification_type)}
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium leading-tight">
                          {notification.title}
                        </p>
                        {!notification.is_read && (
                          <div className="w-2 h-2 bg-blue-600 rounded-full flex-shrink-0 mt-1"></div>
                        )}
                      </div>
                      <p className="text-xs text-gray-600 leading-tight">
                        {notification.message}
                      </p>
                      <div className="flex items-center justify-between">
                        <Badge variant={getNotificationVariant(notification.type || notification.notification_type)} className="text-xs">
                          {(notification.type || notification.notification_type || 'notification').replace('_', ' ')}
                        </Badge>
                        <span className="text-xs text-gray-400">
                          {formatTimeAgo(notification.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                </DropdownMenuItem>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-8 text-center text-gray-500">
            <Bell className="h-8 w-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">No notifications yet</p>
          </div>
        )}

        {notifications.length > 5 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Button
                variant="ghost"
                className="w-full justify-center"
                onClick={handleViewAllNotifications}
              >
                View all notifications
              </Button>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default NotificationBellConverted;