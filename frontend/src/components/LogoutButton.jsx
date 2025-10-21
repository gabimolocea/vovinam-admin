import React from 'react';
import { Button, MenuItem, ListItemIcon, ListItemText } from '@mui/material';
import { LogoutOutlined } from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

const LogoutButton = ({ variant = 'button', sx = {} }) => {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  if (variant === 'menuitem') {
    return (
      <MenuItem onClick={handleLogout} sx={sx}>
        <ListItemIcon>
          <LogoutOutlined fontSize="small" />
        </ListItemIcon>
        <ListItemText>Logout</ListItemText>
      </MenuItem>
    );
  }

  return (
    <Button
      onClick={handleLogout}
      startIcon={<LogoutOutlined />}
      sx={sx}
    >
      Logout
    </Button>
  );
};

export default LogoutButton;