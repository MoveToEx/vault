import axios, { AxiosError } from "axios";

const BASE_URL = import.meta.env.VITE_BASE_URL ?? 'http://localhost:8000/'

const instance = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
});

instance.interceptors.request.use(req => {
  if (!req.headers.Authorization) {
    req.headers.Authorization = 'Bearer ' + JSON.parse(localStorage.getItem('vault-access-token') ?? '""')
  }
  return req;
});

instance.interceptors.response.use(null, async error => {
  if (!(error instanceof AxiosError) ||
    error.response?.status !== 401 ||
    error.request?.url?.startsWith('/auth/login') ||
    error.request?.url?.startsWith('/auth/register') ||
    error.request?.url?.startsWith('/auth/refresh')
  ) {
    throw error;
  }

  const token = JSON.parse(localStorage.getItem('vault-refresh-token') ?? '""');

  if (!token) throw error;

  const response = await axios.post('/auth/refresh', {
    refreshToken: token
  }, {
    baseURL: BASE_URL,
    withCredentials: true,
  });

  if (response.status != 200) {
    throw error;
  }

  const data = await response.data;

  localStorage.setItem('vault-access-token', JSON.stringify(data.data.token));

  return instance(error.request);
});

export const fetcher = async (url: string) => {
  const response = await instance.get(url);
  return response.data.data;
}

export default instance;