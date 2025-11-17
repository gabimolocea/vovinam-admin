import * as React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { User, LogOut, Menu, X, Bell } from 'lucide-react';

export default function Navbar({ content }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAdmin, logout, loading } = useAuth();
  const [userMenuOpen, setUserMenuOpen] = React.useState(false);
  const [notificationsOpen, setNotificationsOpen] = React.useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const handleUserMenuToggle = () => {
    setUserMenuOpen(!userMenuOpen);
    setNotificationsOpen(false); // Close notifications when opening user menu
  };

  const handleNotificationsToggle = () => {
    setNotificationsOpen(!notificationsOpen);
    setUserMenuOpen(false); // Close user menu when opening notifications
  };

  const handleMyAccount = () => {
    setUserMenuOpen(false);
    navigate('/profile');
  };

  const handleLogout = async () => {
    setUserMenuOpen(false);
    await logout();
    navigate('/login');
  };

  const closeAllDropdowns = () => {
    setUserMenuOpen(false);
    setNotificationsOpen(false);
  };

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  const handleMobileNavigation = (path) => {
    navigate(path);
    setMobileMenuOpen(false);
  };

  const handleMobileLogout = async () => {
    setMobileMenuOpen(false);
    await logout();
    navigate('/login');
  };

  // Navigation menu items
  const navigationItems = [
    { title: 'Dashboard', path: '/dashboard' },
    { title: 'News', path: '/news' },
    { title: 'Athletes', path: '/athletes' },
    { title: 'Clubs', path: '/clubs' },
    { title: 'Competitions', path: '/competitions' },
  ];

  // Add admin-only items
  const adminItems = [
    { title: 'Create Club', path: '/create-club' },
    { title: 'Create Athlete', path: '/create-athlete' },
  ];

  const allItems = isAdmin ? [...navigationItems, ...adminItems] : navigationItems;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Navigation */}
      <nav className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50 w-full">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo/Brand */}
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-900 whitespace-nowrap">FRVV Admin</h1>
            </div>

            {/* Desktop Navigation Links - Hidden on mobile */}
            <div className="hidden md:flex items-center space-x-6 flex-1 justify-center">
              {allItems.map((item) => (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                    location.pathname === item.path
                      ? 'text-blue-600 bg-blue-50'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  {item.title}
                </button>
              ))}
            </div>

            {/* Desktop Authentication Section - Hidden on mobile */}
            <div className="hidden md:flex items-center">
              {loading ? (
                // Show loading state with fixed dimensions to prevent shift
                <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse"></div>
              ) : user ? (
                <div className="flex items-center gap-3">
                  {/* Notifications Bell with Dropdown */}
                  <div className="relative">
                    <button
                      className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-md transition-colors"
                      onClick={handleNotificationsToggle}
                      aria-label="Notifications"
                    >
                      <Bell className="w-5 h-5" />
                      {/* Notification badge - uncomment when you have notification count */}
                      <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full text-xs text-white flex items-center justify-center">
                        3
                      </span>
                    </button>

                    {/* Notifications Dropdown */}
                    {notificationsOpen && (
                      <>
                        <div 
                          className="fixed inset-0 z-40" 
                          onClick={closeAllDropdowns}
                        />
                        <div className="absolute top-full right-0 mt-2 w-80 bg-white rounded-md shadow-lg border border-gray-200 z-50 max-h-96 overflow-y-auto">
                          <div className="py-2">
                            <div className="px-4 py-2 border-b border-gray-200">
                              <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
                            </div>
                            
                            {/* Sample notifications - replace with real data */}
                            <div className="divide-y divide-gray-100">
                              <div className="px-4 py-3 hover:bg-gray-50 cursor-pointer">
                                <div className="flex items-start">
                                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                                  <div className="flex-1">
                                    <p className="text-sm text-gray-900">New athlete registration</p>
                                    <p className="text-xs text-gray-500 mt-1">John Doe has registered as an athlete</p>
                                    <p className="text-xs text-gray-400 mt-1">2 minutes ago</p>
                                  </div>
                                </div>
                              </div>
                              
                              <div className="px-4 py-3 hover:bg-gray-50 cursor-pointer">
                                <div className="flex items-start">
                                  <div className="w-2 h-2 bg-green-500 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                                  <div className="flex-1">
                                    <p className="text-sm text-gray-900">Competition results updated</p>
                                    <p className="text-xs text-gray-500 mt-1">Spring Championship results are now available</p>
                                    <p className="text-xs text-gray-400 mt-1">1 hour ago</p>
                                  </div>
                                </div>
                              </div>
                              
                              <div className="px-4 py-3 hover:bg-gray-50 cursor-pointer">
                                <div className="flex items-start">
                                  <div className="w-2 h-2 bg-yellow-500 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                                  <div className="flex-1">
                                    <p className="text-sm text-gray-900">Club approval pending</p>
                                    <p className="text-xs text-gray-500 mt-1">New club registration needs your review</p>
                                    <p className="text-xs text-gray-400 mt-1">3 hours ago</p>
                                  </div>
                                </div>
                              </div>
                            </div>
                            
                            <div className="border-t border-gray-200 px-4 py-2">
                              <button
                                onClick={() => {
                                  navigate('/notifications');
                                  closeAllDropdowns();
                                }}
                                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                              >
                                View all notifications
                              </button>
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* User Avatar Dropdown */}
                  <div className="relative">
                    <button
                      onClick={handleUserMenuToggle}
                      className="flex items-center justify-center w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-700 text-white text-sm font-bold hover:from-blue-600 hover:to-blue-800 transition-all"
                      style={{ borderRadius: '5%' }}
                      aria-expanded={userMenuOpen}
                    >
                      {`${(user.first_name || 'U').charAt(0).toUpperCase()}${(user.last_name || 'S').charAt(0).toUpperCase()}`}
                    </button>
                    
                    {/* User Menu Dropdown */}
                    {userMenuOpen && (
                      <>
                        <div 
                          className="fixed inset-0 z-40" 
                          onClick={closeAllDropdowns}
                        />
                        <div className="absolute top-full right-0 mt-2 w-48 bg-white rounded-md shadow-lg border border-gray-200 z-50">
                          <div className="py-1">
                            <div className="px-4 py-2 border-b border-gray-200">
                              <p className="text-sm font-medium text-gray-900">{user.first_name} {user.last_name}</p>
                              <p className="text-xs text-gray-500">{user.email}</p>
                            </div>
                            <button
                              onClick={handleMyAccount}
                              className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                              <User className="w-4 h-4 mr-2" />
                              My Account
                            </button>
                            <hr className="my-1 border-gray-200" />
                            <button
                              onClick={handleLogout}
                              className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                              <LogOut className="w-4 h-4 mr-2" />
                              Log out
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate('/login')}
                    className="text-sm"
                  >
                    Log In
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => navigate('/register')}
                    className="text-sm"
                  >
                    Register
                  </Button>
                </div>
              )}
            </div>

            {/* Mobile Hamburger Menu Button */}
            <div className="md:hidden flex items-center">
              <button
                onClick={toggleMobileMenu}
                className="p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors"
                aria-label="Toggle mobile menu"
              >
                {mobileMenuOpen ? (
                  <X className="h-6 w-6" />
                ) : (
                  <Menu className="h-6 w-6" />
                )}
              </button>
            </div>
          </div>

          {/* Mobile Menu - Slides down when open */}
          {mobileMenuOpen && (
            <div className="md:hidden border-t border-gray-200 bg-white w-full">
              <div className="px-4 py-3 space-y-1">
                {/* Mobile Navigation Links */}
                {allItems.map((item) => (
                  <button
                    key={item.path}
                    onClick={() => handleMobileNavigation(item.path)}
                    className={`w-full text-left px-3 py-2 rounded-md text-base font-medium transition-colors ${
                      location.pathname === item.path
                        ? 'text-blue-600 bg-blue-50'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    {item.title}
                  </button>
                ))}
                
                {/* Mobile Authentication Section */}
                <div className="pt-3 mt-3 border-t border-gray-200">
                  {loading ? (
                    <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse mx-3"></div>
                  ) : user ? (
                    <div className="space-y-1">
                      <div className="px-3 py-2 text-sm text-gray-500">
                        Signed in as {user.first_name} {user.last_name}
                      </div>
                      <button
                        onClick={handleNotificationsToggle}
                        className="w-full text-left px-3 py-2 rounded-md text-base font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors flex items-center"
                      >
                        <Bell className="w-4 h-4 mr-2" />
                        Notifications
                        {/* Mobile notification badge */}
                        <span className="ml-auto w-5 h-5 bg-red-500 rounded-full text-xs text-white flex items-center justify-center">
                          3
                        </span>
                      </button>
                      <button
                        onClick={() => {
                          setMobileMenuOpen(false);
                          navigate('/profile');
                        }}
                        className="w-full text-left px-3 py-2 rounded-md text-base font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors flex items-center"
                      >
                        <User className="w-4 h-4 mr-2" />
                        My Account
                      </button>
                      <button
                        onClick={handleMobileLogout}
                        className="w-full text-left px-3 py-2 rounded-md text-base font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors flex items-center"
                      >
                        <LogOut className="w-4 h-4 mr-2" />
                        Log out
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setMobileMenuOpen(false);
                          navigate('/login');
                        }}
                        className="w-full"
                      >
                        Log In
                      </Button>
                      <Button
                        onClick={() => {
                          setMobileMenuOpen(false);
                          navigate('/register');
                        }}
                        className="w-full"
                      >
                        Register
                      </Button>
                    </div>
                  )}
                  
                  {/* Mobile Notifications Dropdown */}
                  {notificationsOpen && user && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <div className="bg-gray-50 rounded-md p-3">
                        <h3 className="text-sm font-semibold text-gray-900 mb-2">Notifications</h3>
                        
                        <div className="space-y-3 max-h-48 overflow-y-auto">
                          <div className="flex items-start text-sm">
                            <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                            <div className="flex-1">
                              <p className="text-gray-900">New athlete registration</p>
                              <p className="text-xs text-gray-500 mt-1">John Doe has registered as an athlete</p>
                              <p className="text-xs text-gray-400 mt-1">2 minutes ago</p>
                            </div>
                          </div>
                          
                          <div className="flex items-start text-sm">
                            <div className="w-2 h-2 bg-green-500 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                            <div className="flex-1">
                              <p className="text-gray-900">Competition results updated</p>
                              <p className="text-xs text-gray-500 mt-1">Spring Championship results are now available</p>
                              <p className="text-xs text-gray-400 mt-1">1 hour ago</p>
                            </div>
                          </div>
                          
                          <div className="flex items-start text-sm">
                            <div className="w-2 h-2 bg-yellow-500 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                            <div className="flex-1">
                              <p className="text-gray-900">Club approval pending</p>
                              <p className="text-xs text-gray-500 mt-1">New club registration needs your review</p>
                              <p className="text-xs text-gray-400 mt-1">3 hours ago</p>
                            </div>
                          </div>
                        </div>
                        
                        <button
                          onClick={() => {
                            navigate('/notifications');
                            closeAllDropdowns();
                          }}
                          className="mt-3 text-sm text-blue-600 hover:text-blue-800 font-medium"
                        >
                          View all notifications
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {content}
      </main>
    </div>
  );
}
