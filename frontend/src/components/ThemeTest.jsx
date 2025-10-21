import React from 'react';
import { Box, Typography, Button, useTheme, ListItemButton, ListItemText, Avatar } from '@mui/material';
import { CheckCircle, Cancel } from '@mui/icons-material';

const ThemeTest = () => {
  const theme = useTheme();

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ color: 'primary.main', mb: 3 }}>
        🎨 Dynamic Theme Test Dashboard
      </Typography>
      
      <Box sx={{ mb: 3, p: 2, backgroundColor: 'background.paper', borderRadius: 1, border: `1px solid ${theme.palette.divider}` }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Current Backend Theme Colors:</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 2 }}>
          <Typography><strong>Primary:</strong> {theme.palette.primary.main}</Typography>
          <Typography><strong>Secondary:</strong> {theme.palette.secondary.main}</Typography>
          <Typography><strong>Background Default:</strong> {theme.palette.background.default}</Typography>
          <Typography><strong>Background Paper:</strong> {theme.palette.background.paper}</Typography>
        </Box>
      </Box>

      {/* Test Buttons */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Button Components:</Typography>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <Button variant="contained" color="primary">Primary Button</Button>
          <Button variant="contained" color="secondary">Secondary Button</Button>
          <Button variant="outlined" color="primary">Primary Outlined</Button>
          <Button variant="text" sx={{ color: 'primary.main' }}>Primary Text</Button>
        </Box>
      </Box>

      {/* Test Navigation Item (NavListItem style) */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Navigation Component Test:</Typography>
        <ListItemButton
          selected={true}
          sx={{
            borderRadius: 1,
            maxWidth: 200,
            '&.Mui-selected': {
              backgroundColor: theme.palette.primary.main + '14', // 8% opacity
              color: 'primary.main',
            },
          }}
        >
          <ListItemText primary="Selected Nav Item" />
        </ListItemButton>
      </Box>

      {/* Test Status Icons (ViewAthlete style) */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Status Icons Test:</Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <CheckCircle sx={{ color: 'success.main' }} />
          <Typography>Valid Status</Typography>
          <Cancel sx={{ color: 'text.disabled' }} />
          <Typography>Invalid Status</Typography>
        </Box>
      </Box>

      {/* Test Avatar with border */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Avatar Component Test:</Typography>
        <Avatar
          sx={{ 
            width: 60, 
            height: 60, 
            border: `2px solid ${theme.palette.divider}`,
            backgroundColor: 'primary.main' 
          }}
        >
          T
        </Avatar>
      </Box>

      {/* Color Swatches */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Color Swatches:</Typography>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <Box sx={{ textAlign: 'center' }}>
            <Box sx={{ 
              width: 60, 
              height: 60, 
              backgroundColor: 'primary.main',
              border: `2px solid ${theme.palette.divider}`,
              borderRadius: 1,
              mb: 1
            }} />
            <Typography variant="caption">Primary</Typography>
          </Box>
          <Box sx={{ textAlign: 'center' }}>
            <Box sx={{ 
              width: 60, 
              height: 60, 
              backgroundColor: 'secondary.main',
              border: `2px solid ${theme.palette.divider}`,
              borderRadius: 1,
              mb: 1
            }} />
            <Typography variant="caption">Secondary</Typography>
          </Box>
          <Box sx={{ textAlign: 'center' }}>
            <Box sx={{ 
              width: 60, 
              height: 60, 
              backgroundColor: 'background.default',
              border: `2px solid ${theme.palette.divider}`,
              borderRadius: 1,
              mb: 1
            }} />
            <Typography variant="caption">Background</Typography>
          </Box>
          <Box sx={{ textAlign: 'center' }}>
            <Box sx={{ 
              width: 60, 
              height: 60, 
              backgroundColor: 'background.paper',
              border: `2px solid ${theme.palette.divider}`,
              borderRadius: 1,
              mb: 1
            }} />
            <Typography variant="caption">Paper</Typography>
          </Box>
        </Box>
      </Box>

      {/* Test Result Colors */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Result Status Test:</Typography>
        <Box sx={{ display: 'flex', gap: 3 }}>
          <Typography sx={{ color: 'success.main', fontSize: '0.8rem' }}>WIN</Typography>
          <Typography sx={{ color: 'error.main', fontSize: '0.8rem' }}>LOSS</Typography>
        </Box>
      </Box>

      <Typography variant="body2" sx={{ mt: 3, color: 'text.secondary' }}>
        Expected colors: Primary=Red, Secondary=Green, Background=Yellow, Paper=Magenta
      </Typography>
    </Box>
  );
};

export default ThemeTest;