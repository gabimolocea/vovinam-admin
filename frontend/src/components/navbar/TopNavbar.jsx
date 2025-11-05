import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { 
  Home, 
  Users, 
  UserPlus, 
  Trophy, 
  Bell, 
  Settings,
  LogOut,
  User,
  Menu,
  X,
  Building,
  Newspaper
} from 'lucide-react';
import AxiosInstance from '../Axios';
import NotificationBellConverted from '../NotificationBellConverted';
import { useAuth } from '../../contexts/AuthContext';

const TopNavbar = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, loading, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // Force refresh

  const navigationItems = [
    {
      title: 'Dashboard',
      href: '/dashboard',
      icon: Home,
    },
    {
      title: 'Clubs',
      href: '/clubs',
      icon: Building,
    },
    {
      title: 'Athletes',
      href: '/athletes',
      icon: Users,
    },
    {
      title: 'News',
      href: '/news',
      icon: Newspaper,
    },
    {
      title: 'Competitions',
      href: '/competitions',
      icon: Trophy,
    },
  ];

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
      // Even if logout fails, redirect to login
      navigate('/login');
    }
  };

  const getUserInitials = (user) => {
    if (!user) return 'U';
    const firstName = user.first_name || '';
    const lastName = user.last_name || '';
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || user.username?.charAt(0).toUpperCase() || 'U';
  };

  const isActivePath = (path) => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

return (
    <div className="min-h-screen bg-gray-50">
        {/* Top Navigation Bar */}
        <nav className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-50">
            <div className="mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between h-16">
                    {/* Logo and Navigation */}
                    <div className="flex items-center">
                        {/* Logo */}
                        <div className="flex-shrink-0">
                            <Link to="/dashboard" className="flex items-center">
                                <span className="text-2xl font-bold text-blue-600">FRVV</span>
                                <span className="ml-2 text-sm font-medium text-gray-600">Admin</span>
                            </Link>
                        </div>

                        {/* Desktop Navigation */}
                        <div className="hidden md:ml-10 md:flex md:space-x-8">
                            {navigationItems.map((item) => {
                                const Icon = item.icon;
                                const isActive = isActivePath(item.href);
                                
                                return (
                                    <Link
                                        key={item.href}
                                        to={item.href}
                                        className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-all duration-200 ${
                                            isActive
                                                ? 'border-blue-500 text-blue-600'
                                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                        }`}
                                    >
                                        <Icon className="w-4 h-4 mr-2" />
                                        {item.title}
                                    </Link>
                                );
                            })}
                        </div>
                    </div>

                    {/* Right side - Notifications and User menu */}
                    <div className="flex items-center space-x-4">
                        {/* Notification Bell */}
                        <div className="relative">
                            <NotificationBellConverted />
                        </div>
                        
                        {/* User Menu */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="relative h-10 w-10 rounded-full hover:ring-2 hover:ring-blue-500 hover:ring-offset-2 transition-all">
                                    <Avatar className="h-9 w-9">
                                        <AvatarImage src={user?.avatar} />
                                        <AvatarFallback className="bg-gradient-to-br from-blue-500 to-blue-600 text-white text-sm font-semibold">
                                            {getUserInitials(user)}
                                        </AvatarFallback>
                                    </Avatar>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="w-64" align="end" sideOffset={5}>
                                <div className="flex items-center justify-start gap-3 p-4">
                                    <Avatar className="h-12 w-12">
                                        <AvatarImage src={user?.avatar} />
                                        <AvatarFallback className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
                                            {getUserInitials(user)}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="flex flex-col space-y-1">
                                        {user?.first_name && user?.last_name ? (
                                            <p className="font-semibold text-gray-900">{user.first_name} {user.last_name}</p>
                                        ) : (
                                            <p className="font-semibold text-gray-900">{user?.username}</p>
                                        )}
                                        <p className="text-sm text-gray-500 truncate max-w-[180px]">
                                            {user?.email}
                                        </p>
                                        {user?.is_staff && (
                                            <Badge variant="secondary" className="w-fit text-xs mt-1">
                                                Administrator
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem asChild></DropdownMenuItem>
                                    <Link to="/profile" className="cursor-pointer flex items-center py-2 px-3 hover:bg-gray-50"></Link>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="cursor-pointer text-red-600 focus:text-red-600"
                    onClick={handleLogout}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Mobile menu button */}
              <div className="md:hidden">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                >
                  {mobileMenuOpen ? (
                    <X className="h-6 w-6" />
                  ) : (
                    <Menu className="h-6 w-6" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Navigation Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-gray-200">
            <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3 bg-white">
              {navigationItems.map((item) => {
                const Icon = item.icon;
                const isActive = isActivePath(item.href);
                
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    className={`flex items-center px-3 py-2 rounded-md text-base font-medium transition-colors ${
                      isActive
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Icon className="w-5 h-5 mr-3" />
                    {item.title}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </nav>

      {/* Main Content */}
      <main className="flex-1 px-8 sm:px-4 py-4">
        <div className="mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
};

export default TopNavbar;