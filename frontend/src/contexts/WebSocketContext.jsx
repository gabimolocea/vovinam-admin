import React, { createContext, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './AuthContext';

export const WebSocketContext = createContext();

export const WebSocketProvider = ({ children }) => {
  const { token } = useAuth();
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const [connected, setConnected] = React.useState(false);
  const [subscriptions, setSubscriptions] = React.useState({});

  const getWsUrl = useCallback(() => {
    const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';
    const wsBase = apiBase.replace('http', 'ws').replace('https', 'wss').replace('/api', '');
    // Use a valid Django Channels route: /ws/scoring/field/1/ (field_id=1 as example)
    // In production, replace 1 with the actual field/event/admin event ID as needed
    return `${wsBase}/ws/scoring/field/1/?token=${token}`;
  }, [token]);

  const connect = useCallback(() => {
    if (!token) return;

    try {
      const wsUrl = getWsUrl();
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('WebSocket connected');
        setConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const { type, ...payload } = data;

          // Call all subscribed handlers for this message type
          if (subscriptions[type]) {
            subscriptions[type].forEach((callback) => callback(payload));
          }
        } catch (err) {
          console.error('WebSocket message parse error:', err);
        }
      };

      ws.onerror = (error) => {
        console.warn('WebSocket error (non-critical, app will work without real-time updates):', error);
        setConnected(false);
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setConnected(false);

        // Attempt reconnect after 5 seconds (less aggressive)
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 5000);
      };

      wsRef.current = ws;
    } catch (err) {
      // Non-critical error - app continues to work
      console.warn('WebSocket connection error (non-critical):', err);
      setConnected(false);
    }
  }, [token, getWsUrl, subscriptions]);

  useEffect(() => {
    if (token) {
      connect();
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
    };
  }, [token, connect]);

  const send = useCallback((type, payload = {}) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, ...payload }));
    } else {
      console.warn('WebSocket not connected');
    }
  }, []);

  const subscribe = useCallback((type, callback) => {
    setSubscriptions((prev) => ({
      ...prev,
      [type]: [...(prev[type] || []), callback],
    }));

    // Return unsubscribe function
    return () => {
      setSubscriptions((prev) => ({
        ...prev,
        [type]: (prev[type] || []).filter((cb) => cb !== callback),
      }));
    };
  }, []);

  const value = {
    connected,
    send,
    subscribe,
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocket = () => {
  const context = React.useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within WebSocketProvider');
  }
  return context;
};
