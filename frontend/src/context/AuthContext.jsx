import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import api from '../lib/api';

const AuthContext = createContext(null);
const TOKEN_KEY = 'wingmann_token';

function saveToken(t) { if (t) sessionStorage.setItem(TOKEN_KEY, t); else sessionStorage.removeItem(TOKEN_KEY); }
function loadToken() { return sessionStorage.getItem(TOKEN_KEY); }

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState(null);
  // Keep a ref so logout always closes the latest socket
  const socketRef = useRef(null);

  const connectSocket = useCallback((token) => {
    // Close any existing connection first
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    const s = io(
      import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:4000',
      { auth: { token }, transports: ['websocket'], reconnection: true }
    );
    s.on('connect', () => {
      console.log('[Socket] connected, id:', s.id);
    });
    s.on('connect_error', (err) => {
      console.warn('[Socket] connect error:', err.message);
    });
    socketRef.current = s;
    setSocket(s);
    return s;
  }, []);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    window.__wingmann_token = data.token;
    saveToken(data.token);
    setUser(data.user);
    connectSocket(data.token);
    return data.user;
  }, [connectSocket]);

  const setTokenFromCallback = useCallback((token) => {
    window.__wingmann_token = token;
    saveToken(token);
    connectSocket(token);
  }, [connectSocket]);

  const fetchMe = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me');
      setUser(data.user);
      return data.user;
    } catch {
      setUser(null);
      window.__wingmann_token = null;
      saveToken(null);
      return null;
    }
  }, []);

  const logout = useCallback(() => {
    window.__wingmann_token = null;
    saveToken(null);
    socketRef.current?.disconnect();
    socketRef.current = null;
    setSocket(null);
    setUser(null);
  }, []);

  // Restore session on mount
  useEffect(() => {
    const stored = loadToken();
    if (stored) {
      window.__wingmann_token = stored;
      fetchMe().then(u => {
        if (u) connectSocket(stored);
      }).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []); // eslint-disable-line

  useEffect(() => {
    const handler = () => logout();
    window.addEventListener('auth:expired', handler);
    return () => window.removeEventListener('auth:expired', handler);
  }, [logout]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, fetchMe, setTokenFromCallback, socket }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
