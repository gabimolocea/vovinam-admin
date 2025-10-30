import React from 'react';
import { 
  LayoutDashboard, 
  Users, 
  UserCheck, 
  Trophy, 
  Bell, 
  ClipboardCheck 
} from 'lucide-react';
import {Link} from 'react-router-dom'

const NAVIGATION = [
    { 
        segment: 'dashboard', 
        title: 'Dashboard', 
        icon: <LayoutDashboard className="h-4 w-4" />, 
        link: '/dashboard'
    },
    { 
        segment: 'clubs', 
        title: 'Clubs', 
        icon: <Users className="h-4 w-4" />, 
        link: '/clubs'
    },
    { 
        segment: 'athletes', 
        title: 'Athletes', 
        icon: <UserCheck className="h-4 w-4" />, 
        link: '/athletes'
    },
    { 
        segment: 'competitions', 
        title: 'Competitions', 
        icon: <Trophy className="h-4 w-4" />, 
        link: '/competitions'
    },
    { 
        segment: 'notifications', 
        title: 'Notifications', 
        icon: <Bell className="h-4 w-4" />, 
        link: '/notifications'
    },
    { 
        segment: 'submissions', 
        title: 'Manage Submissions', 
        icon: <ClipboardCheck className="h-4 w-4" />, 
        link: '/admin/submissions'
    },
];

export default NAVIGATION;
