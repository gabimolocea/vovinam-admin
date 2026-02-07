/**
 * useInstallPrompt Hook
 * Manages PWA install prompt lifecycle and user interaction
 */

import { useState, useEffect, useCallback } from 'react';

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    /**
     * Handle beforeinstallprompt event
     * Fired by browser when app is installable
     */
    const handleBeforeInstallPrompt = (e) => {
      // Prevent the mini-infobar from appearing
      e.preventDefault();

      // Store the event for later use
      setDeferredPrompt(e);

      // Show install prompt
      setShowPrompt(true);

      console.log('Install prompt captured');
    };

    /**
     * Check if app is already installed
     */
    const checkIfInstalled = () => {
      // Method 1: Check display mode
      if (window.matchMedia('(display-mode: standalone)').matches) {
        setIsInstalled(true);
      }

      // Method 2: Check navigator.standalone (iOS)
      if (navigator.standalone === true) {
        setIsInstalled(true);
      }
    };

    /**
     * Handle app installed event
     */
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setShowPrompt(false);
      setDeferredPrompt(null);

      console.log('App installed successfully');

      // Track installation
      if (window.gtag) {
        gtag('event', 'app_installed');
      }
    };

    // Attach event listeners
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    // Check initial state
    checkIfInstalled();

    // Listen for display mode changes
    const displayModeQuery = window.matchMedia('(display-mode: standalone)');
    displayModeQuery.addEventListener('change', (e) => {
      setIsInstalled(e.matches);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  /**
   * Trigger the install prompt
   */
  const install = useCallback(async () => {
    if (!deferredPrompt) {
      console.warn('Install prompt not available');
      return false;
    }

    setIsInstalling(true);

    try {
      // Show the install prompt
      deferredPrompt.prompt();

      // Wait for user response
      const { outcome } = await deferredPrompt.userChoice;

      if (outcome === 'accepted') {
        console.log('User accepted install prompt');
        setShowPrompt(false);
        setDeferredPrompt(null);

        // Track acceptance
        if (window.gtag) {
          gtag('event', 'install_accepted');
        }

        return true;
      } else {
        console.log('User dismissed install prompt');

        // Track dismissal
        if (window.gtag) {
          gtag('event', 'install_dismissed');
        }

        return false;
      }
    } catch (error) {
      console.error('Install prompt failed:', error);
      return false;
    } finally {
      setIsInstalling(false);
    }
  }, [deferredPrompt]);

  /**
   * Dismiss the install prompt
   */
  const dismiss = useCallback(() => {
    setShowPrompt(false);

    // Track dismissal
    if (window.gtag) {
      gtag('event', 'install_prompt_dismissed');
    }
  }, []);

  /**
   * Open app settings (platform-specific)
   */
  const openAppSettings = useCallback(() => {
    if (navigator.app) {
      // Android
      navigator.app.exitApp();
    } else if (navigator.webkitStartActivity) {
      // iOS
      navigator.webkitStartActivity(
        new window.NSUserActivity('App Settings')
      );
    }
  }, []);

  return {
    deferredPrompt,
    showPrompt,
    isInstalled,
    isInstalling,
    install,
    dismiss,
    openAppSettings,
    isInstallable: !!deferredPrompt && !isInstalled
  };
}

export default useInstallPrompt;
