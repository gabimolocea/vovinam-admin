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
  startLocalStack: () => ipcRenderer.invoke('services:start-local-stack'),
  stopServices: () => ipcRenderer.invoke('services:stop'),
  startLocalSync: (eventId) => ipcRenderer.invoke('sync:start-local', { eventId }),
  syncToCloud: (eventId) => ipcRenderer.invoke('sync:to-cloud', { eventId }),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),

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
});
