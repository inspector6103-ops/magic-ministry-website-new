(function () {
  const TOKEN_KEY = 'ministryAuthToken';
  const USER_KEY = 'ministryCurrentUser';

  const auth = {
    getToken() {
      return localStorage.getItem(TOKEN_KEY);
    },
    saveToken(token) {
      if (token) {
        localStorage.setItem(TOKEN_KEY, token);
      }
    },
    clearToken() {
      localStorage.removeItem(TOKEN_KEY);
    },
    saveUser(user) {
      if (user) {
        localStorage.setItem(USER_KEY, JSON.stringify(user));
      }
    },
    getUser() {
      const raw = localStorage.getItem(USER_KEY);
      if (!raw) {
        return null;
      }
      try {
        return JSON.parse(raw);
      } catch (error) {
        console.error('사용자 정보를 해석하지 못했습니다.', error);
        localStorage.removeItem(USER_KEY);
        return null;
      }
    },
    clearUser() {
      localStorage.removeItem(USER_KEY);
    },
    async authorizedFetch(input, init = {}) {
      const headers = new Headers(init.headers || {});
      const token = auth.getToken();
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }

      const response = await fetch(input, { ...init, headers });
      if (response.status === 401) {
        auth.clearToken();
        auth.clearUser();
      }
      return response;
    },
    logout() {
      auth.clearToken();
      auth.clearUser();
    },
  };

  window.ministryAuth = auth;
})();
