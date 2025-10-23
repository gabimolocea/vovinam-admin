import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  IconButton,
  Menu,
  MenuItem,
  Typography,
  Box,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Divider,
  Button,
  Chip,
  Paper,
  CircularProgress,
  Tooltip,
} from '@mui/material';
import {
  Notifications as NotificationsIcon,
  NotificationsNone as NotificationsNoneIcon,
  MarkEmailRead as MarkEmailReadIcon,
  Circle as CircleIcon,
} from '@mui/icons-material';
import { useNotifications } from '../contexts/NotificationContext';

const NotificationBell = () => {
  const [anchorEl, setAnchorEl] = useState(null);
  const navigate = useNavigate();
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead } = useNotifications();
  const open = Boolean(anchorEl);

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleNotificationClick = async (notification) => {
    if (!notification.is_read) {
      await markAsRead(notification.id);
    }
    // You can add navigation logic here based on notification type
    handleClose();
  };

  const handleMarkAllRead = async () => {
    await markAllAsRead();
  };

  const handleViewAllNotifications = () => {
    handleClose();
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

  // Show only last 10 notifications in dropdown
  const recentNotifications = notifications.slice(0, 10);

  return (
    <>
      <Tooltip title="Notifications">
        <IconButton
          onClick={handleClick}
          size="large"
          sx={{ color: 'inherit' }}
        >
          <Badge badgeContent={unreadCount} color="error">
            {unreadCount > 0 ? <NotificationsIcon /> : <NotificationsNoneIcon />}
          </Badge>
        </IconButton>
      </Tooltip>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        PaperProps={{
          sx: {
            width: 400,
            maxHeight: 500,
            overflow: 'hidden',
          },
        }}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
      >
        <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">
              Notifications
              {unreadCount > 0 && (
                <Chip
                  label={unreadCount}
                  size="small"
                  color="error"
                  sx={{ ml: 1 }}
                />
              )}
            </Typography>
            {unreadCount > 0 && (
              <Button
                size="small"
                startIcon={<MarkEmailReadIcon />}
                onClick={handleMarkAllRead}
              >
                Mark All Read
              </Button>
            )}
          </Box>
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress size={24} />
          </Box>
        ) : recentNotifications.length === 0 ? (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <NotificationsNoneIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
            <Typography variant="body2" color="text.secondary">
              No notifications yet
            </Typography>
          </Box>
        ) : (
          <List sx={{ p: 0, maxHeight: 400, overflow: 'auto' }}>
            {recentNotifications.map((notification, index) => (
              <React.Fragment key={notification.id}>
                <ListItem
                  button
                  onClick={() => handleNotificationClick(notification)}
                  sx={{
                    backgroundColor: notification.is_read ? 'transparent' : 'action.hover',
                    '&:hover': {
                      backgroundColor: 'action.selected',
                    },
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', width: '100%' }}>
                    <Box sx={{ mr: 2, mt: 0.5 }}>
                      <Typography variant="h6" component="span">
                        {getNotificationIcon(notification.notification_type)}
                      </Typography>
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                        <Typography
                          variant="subtitle2"
                          sx={{
                            fontWeight: notification.is_read ? 'normal' : 'bold',
                            flex: 1,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {notification.title}
                        </Typography>
                        {!notification.is_read && (
                          <CircleIcon sx={{ fontSize: 8, color: 'primary.main', ml: 1 }} />
                        )}
                      </Box>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          mb: 0.5,
                        }}
                      >
                        {notification.message}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {notification.time_since_created}
                      </Typography>
                    </Box>
                  </Box>
                </ListItem>
                {index < recentNotifications.length - 1 && <Divider />}
              </React.Fragment>
            ))}
          </List>
        )}

        {recentNotifications.length > 0 && (
          <>
            <Divider />
            <Box sx={{ p: 1, textAlign: 'center' }}>
              <Button size="small" onClick={handleViewAllNotifications}>
                View All Notifications
              </Button>
            </Box>
          </>
        )}
      </Menu>
    </>
  );
};

export default NotificationBell;