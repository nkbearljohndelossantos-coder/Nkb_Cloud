import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 60000
});

// Request interceptor attaches token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('nkb_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => Promise.reject(error));

// Response interceptor handles session expiry
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401 && !window.location.pathname.includes('/login')) {
      localStorage.removeItem('nkb_token');
      localStorage.removeItem('nkb_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
