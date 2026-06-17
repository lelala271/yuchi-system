import { useCallback, useEffect, useState } from 'react';
import api, { getAuthToken, setAuthToken } from '../services/api';

export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(getAuthToken());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const logout = useCallback(() => {
    setAuthToken(null);
    setToken(null);
    setUser(null);
  }, []);

  const loadCurrentUser = useCallback(async () => {
    const existingToken = getAuthToken();
    if (!existingToken) {
      setUser(null);
      setToken(null);
      setLoading(false);
      return;
    }

    try {
      const profile = await api.getCurrentUser();
      setUser(profile);
      setToken(existingToken);
      setError('');
    } catch (requestError) {
      logout();
      setError(requestError?.response?.data?.error || requestError?.message || '会话已失效');
    } finally {
      setLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    loadCurrentUser();
  }, [loadCurrentUser]);

  const handleAuthSuccess = (data) => {
    setAuthToken(data.token);
    setToken(data.token);
    setUser(data.user);
    setError('');
  };

  const login = useCallback(async ({ username, password }) => {
    setLoading(true);
    try {
      const data = await api.login(username, password);
      handleAuthSuccess(data);
      return { success: true };
    } catch (requestError) {
      const message = requestError?.response?.data?.error || requestError?.message || '登录失败';
      setError(message);
      return { success: false, message };
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(async ({ username, password }) => {
    setLoading(true);
    try {
      const data = await api.register(username, password);
      handleAuthSuccess(data);
      return { success: true };
    } catch (requestError) {
      const message = requestError?.response?.data?.error || requestError?.message || '注册失败';
      setError(message);
      return { success: false, message };
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    user,
    token,
    loading,
    error,
    setError,
    login,
    register,
    logout,
    refresh: loadCurrentUser
  };
};

export default useAuth;
