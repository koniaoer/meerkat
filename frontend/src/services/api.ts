import axios from 'axios';

const API_BASE = '/api/v1';

const api = axios.create({
  baseURL: API_BASE,
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 responses
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.dispatchEvent(new Event('auth-change'));
      // Don't force redirect — let App.tsx handle it
    }
    return Promise.reject(error);
  }
);

// Auth
export const register = (data: { username: string; password: string }) => api.post('/auth/register', data);
export const login = (data: { username: string; password: string }) => api.post('/auth/login', data);
export const getMe = () => api.get('/auth/me');

// Alerts (enhanced)
export const getAlerts = () => api.get('/alerts');
export const getAlertById = (id: number) => api.get(`/alerts/${id}`);
export const getAlertStats = () => api.get('/alerts/stats');
export const getAlertsWithFilters = (params: { status?: string; severity?: string; acknowledged?: boolean; skip?: number; limit?: number }) => api.get('/alerts', { params });
export const acknowledgeAlert = (id: number) => api.put(`/alerts/${id}/acknowledge`);
export const silenceAlert = (id: number, durationMinutes: number) => api.put(`/alerts/${id}/silence`, null, { params: { duration_minutes: durationMinutes } });

// Notification Channels
export const getNotificationChannels = () => api.get('/notification-channels');
export const createNotificationChannel = (data: any) => api.post('/notification-channels', data);
export const updateNotificationChannel = (id: number, data: any) => api.put(`/notification-channels/${id}`, data);
export const deleteNotificationChannel = (id: number) => api.delete(`/notification-channels/${id}`);
export const testNotificationChannel = (id: number) => api.post(`/notification-channels/${id}/test`);
export const testNotificationChannelConfig = (data: any) => api.post('/notification-channels/test', data);

// Model Config
export const getModelConfigs = () => api.get('/model-configs');
export const createModelConfig = (data: any) => api.post('/model-configs', data);
export const updateModelConfig = (id: number, data: any) => api.put(`/model-configs/${id}`, data);
export const deleteModelConfig = (id: number) => api.delete(`/model-configs/${id}`);
export const getActiveModelConfig = () => api.get('/model-configs/active');
export const testModelConfig = (data: any) => api.post('/model-configs/test', data);

// User Management
export const getUsers = () => api.get('/users');
export const createUser = (data: any) => api.post('/users', data);
export const updateUser = (id: number, data: any) => api.put(`/users/${id}`, data);
export const deleteUser = (id: number) => api.delete(`/users/${id}`);

// Remediation Actions
export const getRemediationActions = (params?: any) => api.get('/remediation-actions', { params });
export const getRemediationAction = (id: number) => api.get(`/remediation-actions/${id}`);
export const approveRemediationAction = (id: number, approved: boolean) => api.put(`/remediation-actions/${id}/approve`, { approved, approved_by: 'admin' });
export const executeRemediationAction = (id: number) => api.post(`/remediation-actions/${id}/execute`);

// Routing Rules
export const getRoutingRules = () => api.get('/routing-rules');
export const createRoutingRule = (data: any) => api.post('/routing-rules', data);
export const updateRoutingRule = (id: number, data: any) => api.put(`/routing-rules/${id}`, data);
export const deleteRoutingRule = (id: number) => api.delete(`/routing-rules/${id}`);

// Suppression Rules
export const getSuppressionRules = () => api.get('/suppression-rules');
export const createSuppressionRule = (data: any) => api.post('/suppression-rules', data);
export const updateSuppressionRule = (id: number, data: any) => api.put(`/suppression-rules/${id}`, data);
export const deleteSuppressionRule = (id: number) => api.delete(`/suppression-rules/${id}`);

// Audit Logs
export const getAuditLogs = (params?: any) => api.get('/audit-logs', { params });

export default api;
