const { contextBridge, ipcRenderer } = require('electron');

// Narrow, explicit surface for the renderer - no raw ipcRenderer access,
// no nodeIntegration, so a compromised renderer can't reach the filesystem
// or child_process directly.
contextBridge.exposeInMainWorld('launcher', {
  login: (baseUrl, email, password) => ipcRenderer.invoke('auth:login', { baseUrl, email, password }),
  listEvents: () => ipcRenderer.invoke('events:list'),
  getCloudOverview: () => ipcRenderer.invoke('cloud:overview'),
  getLanIp: () => ipcRenderer.invoke('network:get-lan-ip'),
  getServiceDefs: () => ipcRenderer.invoke('services:defs'),
  isDockerAvailable: () => ipcRenderer.invoke('docker:is-available'),
  startLocalStack: (useDocker) => ipcRenderer.invoke('services:start-local-stack', { useDocker }),
  stopServices: () => ipcRenderer.invoke('services:stop'),
  startLocalSync: (eventId, force = false) => ipcRenderer.invoke('sync:start-local', { eventId, force }),
  syncToCloud: (eventId) => ipcRenderer.invoke('sync:to-cloud', { eventId }),
  verifySync: (eventId) => ipcRenderer.invoke('sync:verify', { eventId }),
  completeSync: (eventId) => ipcRenderer.invoke('sync:complete', { eventId }),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  setActiveAppUrl: (url) => ipcRenderer.send('app-view:set-active-url', url),

  onServiceLog: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('service:log', listener);
    return () => ipcRenderer.removeListener('service:log', listener);
  },
  onServiceStatus: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('service:status', listener);
    return () => ipcRenderer.removeListener('service:status', listener);
  },
  onSyncProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('sync:progress', listener);
    return () => ipcRenderer.removeListener('sync:progress', listener);
  },
  onLoggedOut: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('auth:logged-out', listener);
    return () => ipcRenderer.removeListener('auth:logged-out', listener);
  },
  onSyncMenuWebToLocal: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('sync-menu:web-to-local', listener);
    return () => ipcRenderer.removeListener('sync-menu:web-to-local', listener);
  },
  onSyncMenuLocalToWeb: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('sync-menu:local-to-web', listener);
    return () => ipcRenderer.removeListener('sync-menu:local-to-web', listener);
  },
  onGoBackToPanel: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('app-view:go-back', listener);
    return () => ipcRenderer.removeListener('app-view:go-back', listener);
  },
});
