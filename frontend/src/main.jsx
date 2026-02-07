import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { registerServiceWorker } from './utils/serviceWorkerUtils'

// Register service worker for PWA and offline support
registerServiceWorker()
  .then(registration => {
    if (registration) {
      console.log('PWA enabled - app can work offline');
    }
  })
  .catch(error => {
    console.error('PWA registration failed:', error);
  });

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
