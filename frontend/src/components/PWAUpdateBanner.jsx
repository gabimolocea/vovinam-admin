import React, { useState, useEffect } from 'react';
import { updateApp } from '../utils/serviceWorkerUtils';
import './PWAUpdateBanner.css';

/**
 * PWA Update Banner Component
 * Shows notification when app updates are available
 */
export default function PWAUpdateBanner() {
  const [showUpdate, setShowUpdate] = useState(false);
  const [registration, setRegistration] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    /**
     * Listen for app update available events
     */
    const handleUpdateAvailable = (event) => {
      const reg = event.detail.registration;
      setRegistration(reg);
      setShowUpdate(true);
    };

    window.addEventListener('appUpdateAvailable', handleUpdateAvailable);

    return () => {
      window.removeEventListener('appUpdateAvailable', handleUpdateAvailable);
    };
  }, []);

  /**
   * Handle update button click
   */
  const handleUpdate = async () => {
    setIsUpdating(true);
    if (registration) {
      await updateApp(registration);
    }
  };

  /**
   * Handle dismiss button click
   */
  const handleDismiss = () => {
    setShowUpdate(false);
  };

  if (!showUpdate) {
    return null;
  }

  return (
    <div className="pwa-update-banner">
      <div className="banner-content">
        <div className="banner-icon">✨</div>
        <div className="banner-text">
          <h3>Update Available</h3>
          <p>A new version of Vovinam Admin is ready. Update now to get the latest features and improvements.</p>
        </div>
      </div>

      <div className="banner-actions">
        <button 
          className="btn-update" 
          onClick={handleUpdate}
          disabled={isUpdating}
        >
          {isUpdating ? 'Updating...' : 'Update Now'}
        </button>
        <button 
          className="btn-dismiss" 
          onClick={handleDismiss}
          disabled={isUpdating}
        >
          Later
        </button>
      </div>
    </div>
  );
}
