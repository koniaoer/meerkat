import axios from 'axios';

const API_BASE = '/api/v1';

const api = axios.create({
  baseURL: API_BASE,
});

export const getAlerts = () => api.get('/alerts');
export const getModelConfigs = () => api.get('/model-configs');
export const createModelConfig = (data: any) => api.post('/model-configs', data);
export const updateModelConfig = (id: number, data: any) => api.put(`/model-configs/${id}`, data);
export const deleteModelConfig = (id: number) => api.delete(`/model-configs/${id}`);
export const getActiveModelConfig = () => api.get('/model-configs/active');
export const testModelConfig = (data: any) => api.post('/model-configs/test', data);

// DingTalk Config
export const getDingTalkConfigs = () => api.get('/dingtalk-configs');
export const createDingTalkConfig = (data: any) => api.post('/dingtalk-configs', data);
export const updateDingTalkConfig = (id: number, data: any) => api.put(`/dingtalk-configs/${id}`, data);
export const deleteDingTalkConfig = (id: number) => api.delete(`/dingtalk-configs/${id}`);
export const testDingTalkConfig = (data: any) => api.post('/dingtalk-configs/test', data);

export default api;
