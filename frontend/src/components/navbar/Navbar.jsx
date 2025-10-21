import * as React from 'react';
import { AppProvider } from '@toolpad/core/AppProvider';
import { DashboardLayout } from '@toolpad/core/DashboardLayout';
import { PageContainer } from '@toolpad/core/PageContainer';
import NAVIGATION from './Menu'; // Import the menu
import NavListItem from './NavListItem';
import { List, Box } from '@mui/material';
import { useLocation } from 'react-router-dom';

export default function Navbar({ content }) {
  const location = useLocation();

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


  // Highlight active menu item
  const updatedNavigation = NAVIGATION.map((item) => {
    const itemPath = item.link?.props?.to || ''; // Extract the path from the link
    const isActive = location.pathname === item.link; // Check if the current route matches the menu item's path

    return {
      ...item,
      active: isActive, // Add an active property to the menu item
    };
  });

  return (
    <AppProvider
      navigation={updatedNavigation} // Pass the updated navigation with active states
      breadcrumbs={false} // Disable breadcrumbs
      branding={{
        title: 'FRVV Admin',
        homeUrl: '/dashboard', // Updated home URL
      }}
    >
      <DashboardLayout>
        <PageContainer breadcrumbs={false} title={pageTitle}>
          {/* Fallback nav list rendered inside the page for visual consistency */}
          <Box sx={{ mb: 2, display: { xs: 'none', md: 'block' } }}>
            <List sx={{ display: 'flex', gap: 1, p: 0 }}>
              {updatedNavigation.map((item) => (
                <NavListItem key={item.segment} item={item} active={item.active} />
              ))}
            </List>
          </Box>
          {content}
        </PageContainer>
      </DashboardLayout>
    </AppProvider>
  );
}
