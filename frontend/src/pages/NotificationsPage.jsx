import React, { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Box,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Divider,
  Button,
  Chip,
  IconButton,
  Checkbox,
  Toolbar,
  Tooltip,
  CircularProgress,
  Alert,
  Paper,
  Grid,
} from '@mui/material';
import {
  MarkEmailRead as MarkEmailReadIcon,
  Delete as DeleteIcon,
  FilterList as FilterListIcon,
  Refresh as RefreshIcon,
  Circle as CircleIcon,
} from '@mui/icons-material';
import { useNotifications } from '../contexts/NotificationContext';

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

  // Filter notifications based on current filter
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

  // Handle notification selection
  const handleSelectNotification = (notificationId) => {
    setSelectedNotifications(prev => {
      if (prev.includes(notificationId)) {
        return prev.filter(id => id !== notificationId);
      } else {
        return [...prev, notificationId];
      }
    });
  };

  // Handle select all
  const handleSelectAll = () => {
    if (selectedNotifications.length === filteredNotifications.length) {
      setSelectedNotifications([]);
    } else {
      setSelectedNotifications(filteredNotifications.map(n => n.id));
    }
  };

  // Handle mark selected as read
  const handleMarkSelectedAsRead = async () => {
    if (selectedNotifications.length > 0) {
      await markSelectedAsRead(selectedNotifications);
      setSelectedNotifications([]);
    }
  };

  // Handle single notification click
  const handleNotificationClick = async (notification) => {
    if (!notification.is_read) {
      await markAsRead(notification.id);
    }
  };

  // Get notification icon
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

  // Get notification color
  const getNotificationColor = (type) => {
    switch (type) {
      case 'result_approved':
        return 'success';
      case 'result_rejected':
        return 'error';
      case 'result_revision_required':
        return 'warning';
      case 'result_submitted':
        return 'info';
      case 'competition_created':
        return 'primary';
      case 'competition_updated':
        return 'secondary';
      case 'system_announcement':
        return 'info';
      default:
        return 'default';
    }
  };

  // Format notification type for display
  const formatNotificationType = (type) => {
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  useEffect(() => {
    // Clear selections when filter changes
    setSelectedNotifications([]);
  }, [filter]);

  if (loading && notifications.length === 0) {
    return (
      <Container maxWidth="md" sx={{ mt: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Notifications
          {unreadCount > 0 && (
            <Chip
              label={`${unreadCount} unread`}
              color="error"
              size="small"
              sx={{ ml: 2 }}
            />
          )}
        </Typography>
      </Box>

      {/* Action Toolbar */}
      <Paper sx={{ mb: 3 }}>
        <Toolbar>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
            <Checkbox
              checked={selectedNotifications.length === filteredNotifications.length && filteredNotifications.length > 0}
              indeterminate={selectedNotifications.length > 0 && selectedNotifications.length < filteredNotifications.length}
              onChange={handleSelectAll}
            />
            <Typography variant="body2" color="text.secondary">
              {selectedNotifications.length > 0 
                ? `${selectedNotifications.length} selected`
                : `${filteredNotifications.length} notifications`
              }
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', gap: 1 }}>
            {/* Filter Buttons */}
            <Button
              variant={filter === 'all' ? 'contained' : 'outlined'}
              size="small"
              onClick={() => setFilter('all')}
            >
              All ({notifications.length})
            </Button>
            <Button
              variant={filter === 'unread' ? 'contained' : 'outlined'}
              size="small"
              onClick={() => setFilter('unread')}
            >
              Unread ({unreadCount})
            </Button>
            <Button
              variant={filter === 'read' ? 'contained' : 'outlined'}
              size="small"
              onClick={() => setFilter('read')}
            >
              Read ({notifications.length - unreadCount})
            </Button>

            <Divider orientation="vertical" flexItem />

            {/* Action Buttons */}
            {selectedNotifications.length > 0 && (
              <Tooltip title="Mark selected as read">
                <IconButton onClick={handleMarkSelectedAsRead} size="small">
                  <MarkEmailReadIcon />
                </IconButton>
              </Tooltip>
            )}

            {unreadCount > 0 && (
              <Tooltip title="Mark all as read">
                <IconButton onClick={markAllAsRead} size="small">
                  <MarkEmailReadIcon />
                </IconButton>
              </Tooltip>
            )}

            <Tooltip title="Refresh">
              <IconButton onClick={fetchNotifications} size="small">
                <RefreshIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Toolbar>
      </Paper>

      {/* Notifications List */}
      {filteredNotifications.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 8 }}>
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No notifications found
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {filter === 'unread' 
                ? "You're all caught up! No unread notifications."
                : filter === 'read'
                ? "No read notifications yet."
                : "You don't have any notifications yet."
              }
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <List sx={{ p: 0 }}>
            {filteredNotifications.map((notification, index) => (
              <React.Fragment key={notification.id}>
                <ListItem
                  sx={{
                    backgroundColor: notification.is_read ? 'transparent' : 'action.hover',
                    cursor: 'pointer',
                    '&:hover': {
                      backgroundColor: 'action.selected',
                    },
                  }}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', width: '100%' }}>
                    <Checkbox
                      checked={selectedNotifications.includes(notification.id)}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleSelectNotification(notification.id);
                      }}
                      sx={{ mr: 1, mt: 0.5 }}
                    />
                    
                    <Box sx={{ mr: 2, mt: 1 }}>
                      <Typography variant="h5" component="span">
                        {getNotificationIcon(notification.notification_type)}
                      </Typography>
                    </Box>

                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                        <Typography
                          variant="h6"
                          sx={{
                            fontWeight: notification.is_read ? 'normal' : 'bold',
                            flex: 1,
                          }}
                        >
                          {notification.title}
                        </Typography>
                        {!notification.is_read && (
                          <CircleIcon sx={{ fontSize: 10, color: 'primary.main', ml: 1 }} />
                        )}
                      </Box>

                      <Typography
                        variant="body1"
                        color="text.secondary"
                        sx={{ mb: 2, whiteSpace: 'pre-wrap' }}
                      >
                        {notification.message}
                      </Typography>

                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Chip
                          label={formatNotificationType(notification.notification_type)}
                          size="small"
                          color={getNotificationColor(notification.notification_type)}
                          variant="outlined"
                        />
                        <Typography variant="caption" color="text.secondary">
                          {notification.time_since_created}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                </ListItem>
                {index < filteredNotifications.length - 1 && <Divider />}
              </React.Fragment>
            ))}
          </List>
        </Card>
      )}
    </Container>
  );
};

export default NotificationsPage;