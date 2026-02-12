import React from 'react';
import { Breadcrumbs as MUIBreadcrumbs, Link, Typography } from '@mui/material';
import { useLocation, Link as RouterLink } from 'react-router-dom';

function pathToBreadcrumbs(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  const crumbs = [];
  let path = '';
  for (let i = 0; i < parts.length; i++) {
    path += '/' + parts[i];
    crumbs.push({
      label: parts[i].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      path,
    });
  }
  return crumbs;
}

export default function Breadcrumbs() {
  const location = useLocation();
  const crumbs = pathToBreadcrumbs(location.pathname);
  return (
    <MUIBreadcrumbs aria-label="breadcrumb" sx={{ mb: 2, bgcolor: '#fff', p: 1, borderRadius: 1 }}>
      <Link component={RouterLink} underline="hover" color="inherit" to="/">
        Home
      </Link>
      {crumbs.map((crumb, idx) =>
        idx === crumbs.length - 1 ? (
          <Typography color="text.primary" key={crumb.path}>{crumb.label}</Typography>
        ) : (
          <Link component={RouterLink} underline="hover" color="inherit" to={crumb.path} key={crumb.path}>
            {crumb.label}
          </Link>
        )
      )}
    </MUIBreadcrumbs>
  );
}
