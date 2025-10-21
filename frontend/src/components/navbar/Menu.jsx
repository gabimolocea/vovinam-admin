import React from 'react';
import DashboardIcon from '@mui/icons-material/Dashboard';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import BarChartIcon from '@mui/icons-material/BarChart';
import DescriptionIcon from '@mui/icons-material/Description';
import LayersIcon from '@mui/icons-material/Layers';
import {Link} from 'react-router'
import Groups2Icon from '@mui/icons-material/Groups2';
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';

const NAVIGATION = [
    { 
        segment: 'dashboard', 
        title: 'Dashboard', 
        icon: <DashboardIcon />, 
        link: '/dashboard'
    },
    { 
        segment: 'clubs', 
        title: 'Clubs', 
        icon: <Groups2Icon />, 
        link: '/clubs'
    },
    { 
        segment: 'athletes', 
        title: 'Athletes', 
        icon: <AssignmentIndIcon />, 
        link: '/athletes'
    },
    { 
        segment: 'competitions', 
        title: 'Competitions', 
        icon: <EmojiEventsIcon />, 
        link: '/competitions'
    },
];

export default NAVIGATION;
