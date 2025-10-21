import * as React from 'react';
import { AppProvider } from '@toolpad/core/AppProvider';
import { DashboardLayout } from '@toolpad/core/DashboardLayout';
import { PageContainer } from '@toolpad/core/PageContainer';
import NAVIGATION from './Menu'; // Import the menu
import NavListItem from './NavListItem';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { MenuItem, Divider, IconButton, Avatar, Menu } from '@mui/material';
import { Person, Logout } from '@mui/icons-material';

export default function Navbar({ content }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAdmin, logout } = useAuth();
  const [anchorEl, setAnchorEl] = React.useState(null);

  const handleMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };
  


  // Handler for My Account link
  const handleMyAccount = () => {
    setAnchorEl(null);
    navigate('/profile');
  };

  const handleLogout = async () => {
    setAnchorEl(null);
    await logout();
    navigate('/login');
  };

  // Map routes to page titles
  const pageTitles = {
    '/dashboard': 'Dashboard', // Updated path
    '/create-club': 'Create Club',
    '/clubs': 'Clubs',
    '/orders': 'Orders',
    '/reports/sales': 'Sales Reports',
    '/reports/traffic': 'Traffic Reports',
    '/integrations': 'Integrations',
    '/athletes': 'Athletes',
    '/create-athlete': 'Create Athlete',
  };

  // Determine the page title based on the current route
  let pageTitle = pageTitles[location.pathname] || 'FRVV Admin';

  // Handle dynamic routes like /clubs/edit/:id
  if (location.pathname.startsWith('/clubs/edit')) {
    pageTitle = 'Edit Club';
  }

    // Handle dynamic routes like /clubs/edit/:id
    if (location.pathname.startsWith('/athletes/edit')) {
      pageTitle = 'Edit Athlete';
    }
    // Handle dynamic routes like /athletes/:id
    if (location.pathname.startsWith('/athletes/')) {
      const athleteId = location.pathname.split('/')[2]; // Extract the athlete ID from the URL
      // Fetch athlete data based on the ID (mocked for now)
      const athleteData = { first_name: 'John', last_name: 'Doe' }; // Replace with actual API call or data lookup
      pageTitle = null; // Hide the title for this type of page
    }

    if (location.pathname.startsWith('/competition/')) {
      const competitionId = location.pathname.split('/')[2]; // Extract the competition ID from the URL
      // Fetch competition data based on the ID (mocked for now)
      const competitionData = { name: 'Spring Championship' }; // Replace with actual API call or data lookup
      pageTitle = null;
    }

   

    if (location.pathname === '/competitions') {
      pageTitle = 'Competitions'; // Set the title for the competitions page
    }

    if (location.pathname.startsWith('/clubs/')) {
      pageTitle = null; // Hide the title for this type of page
    }


  // Filter navigation based on user role and highlight active menu item
  const filteredNavigation = NAVIGATION.filter((item) => {
    // Show all items to admins, restrict creation items for regular users
    if (!isAdmin && (item.title === 'Create Club' || item.title === 'Create Athlete')) {
      return false;
    }
    return true;
  });

  const updatedNavigation = filteredNavigation.map((item) => {
    const itemPath = item.link?.props?.to || ''; // Extract the path from the link
    const isActive = location.pathname === item.link; // Check if the current route matches the menu item's path

    return {
      ...item,
      active: isActive, // Add an active property to the menu item
    };
  });



  return (
      <AppProvider
        navigation={updatedNavigation}
        breadcrumbs={false} // Disable breadcrumbs
        branding={{
          title: 'FRVV Admin',
          homeUrl: '/dashboard', // Updated home URL
        }}
      >
        <DashboardLayout
          slots={{
            toolbarActions: () => (
              user && (
                <>
                  <IconButton
                    onClick={handleMenuOpen}
                    size="small"
                    aria-controls={Boolean(anchorEl) ? 'account-menu' : undefined}
                    aria-haspopup="true"
                    aria-expanded={Boolean(anchorEl) ? 'true' : undefined}
                    sx={{ mr: 1 }}
                  >
                    <Avatar sx={{ width: 32, height: 32, fontSize: '0.875rem' }}>
                      {`${(user.first_name || 'U').charAt(0).toUpperCase()}${(user.last_name || 'S').charAt(0).toUpperCase()}`}
                    </Avatar>
                  </IconButton>
                  
                  <Menu
                    anchorEl={anchorEl}
                    id="account-menu"
                    open={Boolean(anchorEl)}
                    onClose={handleMenuClose}
                    PaperProps={{
                      elevation: 0,
                      sx: {
                        overflow: 'visible',
                        filter: 'drop-shadow(0px 2px 8px rgba(0,0,0,0.32))',
                        mt: 1.5,
                        minWidth: 180,
                        position: 'fixed !important',
                        top: '48px !important',
                        right: '16px !important',
                        left: 'unset !important',
                        '& .MuiAvatar-root': {
                          width: 32,
                          height: 32,
                          ml: -0.5,
                          mr: 1,
                        },
                        '&:before': {
                          content: '""',
                          display: 'block',
                          position: 'absolute',
                          top: 0,
                          right: 14,
                          width: 10,
                          height: 10,
                          bgcolor: 'background.paper',
                          transform: 'translateY(-50%) rotate(45deg)',
                          zIndex: 0,
                        },
                      },
                    }}
                    transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                    anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
                  >
                    <MenuItem onClick={handleMyAccount}>
                      <Person fontSize="small" sx={{ mr: 1 }} />
                      My Account
                    </MenuItem>
                    <Divider />
                    <MenuItem onClick={handleLogout}>
                      <Logout fontSize="small" sx={{ mr: 1 }} />
                      Log out
                    </MenuItem>
                  </Menu>
                </>
              )
            ),
          }}
        >
          <PageContainer breadcrumbs={false} title={pageTitle}>
            {content}
          </PageContainer>
        </DashboardLayout>
      </AppProvider>
  );
}
