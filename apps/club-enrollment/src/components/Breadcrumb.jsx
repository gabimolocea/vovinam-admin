import { Link as RouterLink } from 'react-router-dom'
import { Breadcrumbs, Link, Typography, Box } from '@mui/material'
import NavigateNextIcon from '@mui/icons-material/NavigateNext'

const Breadcrumb = ({ items }) => {
  return (
    <Box sx={{ px: 3, py: 2 }}>
      <Breadcrumbs
        separator={<NavigateNextIcon fontSize="small" />}
        aria-label="breadcrumb"
        sx={{
          '& ol': {
            margin: 0,
          },
          '& .MuiBreadcrumbs-li': {
            fontSize: '0.9rem',
          },
        }}
      >
        {items.map((item, index) => {
          const isLast = index === items.length - 1

          if (isLast) {
            return (
              <Typography key={index} color="textPrimary" sx={{ fontWeight: 500 }}>
                {item.label}
              </Typography>
            )
          }

          return (
            <Link
              key={index}
              component={RouterLink}
              to={item.path}
              color="inherit"
              sx={{
                cursor: 'pointer',
                '&:hover': {
                  color: 'primary.main',
                },
              }}
            >
              {item.label}
            </Link>
          )
        })}
      </Breadcrumbs>
    </Box>
  )
}

export default Breadcrumb
