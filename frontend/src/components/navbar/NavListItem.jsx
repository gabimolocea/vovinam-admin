import React from 'react';
import { ListItemButton, ListItemIcon, ListItemText } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

export default function NavListItem({ item, active }) {
  return (
    <ListItemButton
      component={RouterLink}
      to={item.link}
      selected={active}
      sx={{
        borderRadius: 1,
        '&.Mui-selected': {
          backgroundColor: (theme) => theme.palette.primary.main + '14', // 8% opacity
          color: 'primary.main',
        },
      }}
    >
      {item.icon && <ListItemIcon sx={{ color: 'inherit' }}>{item.icon}</ListItemIcon>}
      <ListItemText primary={item.title} />
    </ListItemButton>
  );
}
