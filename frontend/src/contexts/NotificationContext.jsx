import React, { createContext, useContext, useState, useEffect } from 'react';
import AxiosInstance from '../components/Axios';
import { useAuth } from './AuthContext';

const NotificationContext = createContext();

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

export const NotificationProvider = ({ children }) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  // Fetch notifications
  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const response = await AxiosInstance.get('notifications/');
      setNotifications(response.data.results || response.data);
    } catch (error) {
      if (error.response?.status !== 401) {
        console.error('Error fetching notifications:', error);
      }
    } finally {
      setLoading(false);
    }
  };

  // Fetch unread count
  const fetchUnreadCount = async () => {
    try {
      const response = await AxiosInstance.get('notifications/unread_count/');
      setUnreadCount(response.data.unread_count);
    } catch (error) {
      if (error.response?.status !== 401) {
        console.error('Error fetching unread count:', error);
      }
    }
  };

  // Mark notification as read
  const markAsRead = async (notificationId) => {
    try {
      await AxiosInstance.post(`notifications/${notificationId}/mark_read/`);
      
      // Update local state
      setNotifications(prev => 
        prev.map(notification => 
          notification.id === notificationId 
            ? { ...notification, is_read: true, read_at: new Date().toISOString() }
            : notification
        )
      );
      
      // Update unread count
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  // Mark all notifications as read
  const markAllAsRead = async () => {
    try {
      await AxiosInstance.post('notifications/mark_all_read/');
      
      // Update local state
      setNotifications(prev => 
        prev.map(notification => ({
          ...notification,
          is_read: true,
          read_at: new Date().toISOString()
        }))
      );
      
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  // Mark selected notifications as read
  const markSelectedAsRead = async (notificationIds) => {
    try {
      await AxiosInstance.post('notifications/mark_selected_read/', {
        notification_ids: notificationIds
      });
      
      // Update local state
      setNotifications(prev => 
        prev.map(notification => 
          notificationIds.includes(notification.id)
            ? { ...notification, is_read: true, read_at: new Date().toISOString() }
            : notification
        )
      );
      
      // Update unread count
      const unreadBeingMarked = notifications.filter(n => 
        notificationIds.includes(n.id) && !n.is_read
      ).length;
      setUnreadCount(prev => Math.max(0, prev - unreadBeingMarked));
    } catch (error) {
      console.error('Error marking selected notifications as read:', error);
    }
  };

  // Add a new notification (for real-time updates)
  const addNotification = (notification) => {
    setNotifications(prev => [notification, ...prev]);
    if (!notification.is_read) {
      setUnreadCount(prev => prev + 1);
    }
  };

  // Initialize notifications when user is authenticated
  useEffect(() => {
    if (user) {
      fetchNotifications();
      fetchUnreadCount();
    } else {
      // Clear notifications when user logs out
      setNotifications([]);
      setUnreadCount(0);
    }
  }, [user]);

  // Refresh notifications periodically (every 30 seconds) only when authenticated
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      fetchUnreadCount();
    }, 30000);

    return () => clearInterval(interval);
  }, [user]);

  const value = {
    notifications,
    unreadCount,
    loading,
    fetchNotifications,
    fetchUnreadCount,
    markAsRead,
    markAllAsRead,
    markSelectedAsRead,
    addNotification,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};