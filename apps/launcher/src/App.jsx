import { useEffect, useState } from 'react';
import LoginPage from './pages/LoginPage.jsx';
import OverviewPage from './pages/OverviewPage.jsx';
import EventPickerPage from './pages/EventPickerPage.jsx';
import SyncLocalPage from './pages/SyncLocalPage.jsx';
import ControlPanelPage from './pages/ControlPanelPage.jsx';
import SyncToCloudPage from './pages/SyncToCloudPage.jsx';
import AppViewPage from './pages/AppViewPage.jsx';

// A linear flow - no router needed, `screen` is the only navigation
// state. Each screen hands the next one what it needs via plain props,
// mirroring how the day actually unfolds: log in, see what's in the
// cloud, pick the event, pull it down, run the competition, push results
// back up. `activeApp` is a separate overlay state so opening a local app
// (competition-admin etc.) stays inside this same window instead of
// spawning a new one, and going back doesn't lose your place in the flow.
export default function App() {
  const [screen, setScreen] = useState('login');
  const [event, setEvent] = useState(null);
  const [localInfo, setLocalInfo] = useState(null); // { lanIp, urls }
  const [activeApp, setActiveApp] = useState(null); // { id, url, title }

  useEffect(() => {
    // Triggered from the "Account > Deconectare" native menu item. The
    // local stack (if running) is left alone by main.js - only the cloud
    // session resets, so we send the operator back to the login screen.
    if (!window.launcher) return undefined;
    return window.launcher.onLoggedOut(() => {
      setEvent(null);
      setActiveApp(null);
      setScreen('login');
    });
  }, []);

  if (activeApp) {
    return <AppViewPage app={activeApp} onBack={() => setActiveApp(null)} />;
  }

  return (
    <div className="screen">
      {screen === 'login' && <LoginPage onLoggedIn={() => setScreen('overview')} />}

      {screen === 'overview' && <OverviewPage onContinue={() => setScreen('events')} />}

      {screen === 'events' && (
        <EventPickerPage
          onBack={() => setScreen('overview')}
          onSelect={(ev) => {
            setEvent(ev);
            setScreen('sync-local');
          }}
        />
      )}

      {screen === 'sync-local' && (
        <SyncLocalPage
          event={event}
          onBack={() => setScreen('events')}
          onDone={(info) => {
            setLocalInfo(info);
            setScreen('control');
          }}
        />
      )}

      {screen === 'control' && (
        <ControlPanelPage
          event={event}
          localInfo={localInfo}
          onOpenApp={(id, url, title) => setActiveApp({ id, url, title })}
          onSyncToCloud={() => setScreen('sync-cloud')}
        />
      )}

      {screen === 'sync-cloud' && (
        <SyncToCloudPage
          event={event}
          onBack={() => setScreen('control')}
          onDone={() => setScreen('login')}
        />
      )}
    </div>
  );
}
