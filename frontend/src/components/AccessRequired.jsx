import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
import { LockIcon, UserIcon, UserPlusIcon } from 'lucide-react';

const AccessRequired = ({ 
  title = "Access Required", 
  message = "You need to log in to have access to this content.",
  showActions = true 
}) => {
  const navigate = useNavigate();

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="mb-6">
          <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <LockIcon className="h-8 w-8 text-gray-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">{title}</h2>
          <p className="text-gray-600 leading-relaxed">{message}</p>
        </div>
        
        {showActions && (
          <div className="space-y-3">
            <Button
              onClick={() => navigate('/login')}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            >
              <UserIcon className="h-4 w-4 mr-2" />
              Log In
            </Button>
            <Button
              onClick={() => navigate('/register')}
              variant="outline"
              className="w-full border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              <UserPlusIcon className="h-4 w-4 mr-2" />
              Create Account
            </Button>
          </div>
        )}
        
        <div className="mt-6 pt-6 border-t border-gray-200">
          <p className="text-sm text-gray-500">
            Need help? Contact support for assistance.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AccessRequired;