import React, { useState } from 'react';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import './InstallPrompt.css';

/**
 * Install Prompt Component
 * Shows install button when app is installable
 */
export default function InstallPrompt() {
  const { 
    isInstallable, 
    isInstalled, 
    isInstalling, 
    install, 
    dismiss 
  } = useInstallPrompt();
  
  const [showManualPrompt, setShowManualPrompt] = useState(false);

  if (!isInstallable) {
    return null;
  }

  return (
    <>
      {/* Subtle banner prompt */}
      <div className="install-prompt-banner">
        <div className="banner-content">
          <div className="banner-icon">📱</div>
          <div className="banner-text">
            <h3>Install Vovinam Admin</h3>
            <p>Add to your home screen for offline access</p>
          </div>
        </div>

        <div className="banner-actions">
          <button 
            className="btn-install" 
            onClick={install}
            disabled={isInstalling}
          >
            {isInstalling ? 'Installing...' : 'Install'}
          </button>
          <button 
            className="btn-dismiss" 
            onClick={dismiss}
            disabled={isInstalling}
          >
            Not Now
          </button>
        </div>
      </div>

      {/* Manual prompt option in header */}
      <button 
        className="install-prompt-button"
        onClick={async () => {
          const success = await install();
          if (success) {
            setShowManualPrompt(false);
          }
        }}
        disabled={isInstalling}
        title="Install app"
      >
        ⬇️ Install
      </button>
    </>
  );
}
