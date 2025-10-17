(function () {
  const AUTH_TOKEN_KEY = 'ministryAuthToken';
  const CURRENT_USER_KEY = 'ministryCurrentUser';
  const ROLE_KEY = 'ministryCurrentRole';

  const safeGet = key => {
    try {
      return localStorage.getItem(key) || '';
    } catch (error) {
      console.warn('localStorage.getItem failed', error);
      return '';
    }
  };

  const safeSet = (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.warn('localStorage.setItem failed', error);
    }
  };

  const safeRemove = key => {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.warn('localStorage.removeItem failed', error);
    }
  };

  const getToken = () => safeGet(AUTH_TOKEN_KEY);
  const getUser = () => safeGet(CURRENT_USER_KEY);
  const getRole = () => safeGet(ROLE_KEY) || 'user';

  const isAuthenticated = () => Boolean(getToken() && getUser());

  const setSession = ({ token, userId, role }) => {
    if (!token || !userId) {
      return;
    }

    safeSet(AUTH_TOKEN_KEY, token);
    safeSet(CURRENT_USER_KEY, userId);
    safeSet(ROLE_KEY, role || 'user');
  };

  const clearSession = () => {
    safeRemove(AUTH_TOKEN_KEY);
    safeRemove(CURRENT_USER_KEY);
    safeRemove(ROLE_KEY);
  };

  const requireSession = () => {
    const token = getToken();
    const userId = getUser();

    if (!token || !userId) {
      clearSession();
      return null;
    }

    return { token, userId, role: getRole() };
  };

  window.ministryAuth = Object.freeze({
    AUTH_TOKEN_KEY,
    CURRENT_USER_KEY,
    ROLE_KEY,
    getToken,
    getUser,
    getRole,
    isAuthenticated,
    setSession,
    clearSession,
    requireSession,
  });
})();
