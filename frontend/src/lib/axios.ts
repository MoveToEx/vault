import axios, { AxiosError } from "axios";
import type { Wrapped } from "./types";

const BASE_URL = import.meta.env.VITE_BASE_URL ?? 'http://localhost:8000/';

type RefreshResponse = Wrapped<{
  token: string,
  refreshToken: string,
}>

const instance = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
});

const startsWith = (str: string, prefix: string[]) => prefix.some(it => str.startsWith(it));

const AUTH_IGNORE = [
  '/auth/login',
  '/auth/register',
  '/auth/refresh'
]

let refreshPromise: Promise<void> | null = null;

instance.interceptors.request.use(
  async req => {
    await refreshPromise;

    req.headers.Authorization = 'Bearer ' + JSON.parse(localStorage.getItem('vault-access-token') ?? '""')

    return req;
  },
  null,
  {
    runWhen(config) {
      return !!config.url && !startsWith(config.url, AUTH_IGNORE);
    }
  }
);

instance.interceptors.response.use(
  null,
  async error => {
    if (!(error instanceof AxiosError) ||
      error.response?.status !== 401 ||
      startsWith(error.request?.url, AUTH_IGNORE)
    ) {
      throw error;
    }

    const token = JSON.parse(localStorage.getItem('vault-refresh-token') ?? '""');

    if (!token) throw error;

    const req = error.config;

    if (!req || req._retry) return;

    if (!refreshPromise) {
      refreshPromise = axios.post<RefreshResponse>('/auth/refresh', {
        refreshToken: token
      }, {
        baseURL: BASE_URL,
        withCredentials: true
      }).then(response => {
        localStorage.setItem('vault-access-token', JSON.stringify(response.data.data.token));
        localStorage.setItem('vault-refresh-token', JSON.stringify(response.data.data.refreshToken));
      }).finally(() => {
        refreshPromise = null;
      });
    }

    await refreshPromise;

    return instance({
      ...req,
      _retry: true
    });
  }
);

export const fetcher = async (url: string) => {
  const response = await instance.get(url);
  return response.data.data;
}

export default instance;