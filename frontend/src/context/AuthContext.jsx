import React, { createContext, useState, useContext, useEffect } from 'react';
import { jwtDecode } from 'jwt-decode';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(localStorage.getItem('gf_token') || null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (token) {
      try {
        const decoded = jwtDecode(token);
        setUser({ id: decoded.sub, role: localStorage.getItem('gf_role') });
      } catch (e) {
        logout();
      }
    }
  }, [token]);

  const login = (accessToken, userRole) => {
    localStorage.setItem('gf_token', accessToken);
    localStorage.setItem('gf_role', userRole);
    setToken(accessToken);
  };

  const logout = () => {
    localStorage.removeItem('gf_token');
    localStorage.removeItem('gf_role');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ token, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
