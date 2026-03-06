import api from './api';

// Tipos padronizados de resposta (alinhados ao backend)
export interface MetricResponse<T = number> {
  metric: string;
  value: T;
  unit?: string;
  details?: Record<string, any>;
}

export interface MetricItem<T = number> {
  label: string;
  value: T;
  details?: Record<string, any>;
}

export interface MetricItemsResponse<T = number> {
  metric: string;
  items: Array<MetricItem<T>>;
  unit?: string;
}

export interface CompanyPeriodParams {
  company_id?: number;
  start_date: string;
  end_date: string;
  [key: string]: any;
}

export async function getShowRate(params: CompanyPeriodParams): Promise<MetricResponse<number>> {
  const res = await api.get('/dashboard/metrics/attendance-show-rate', { params });
  return res.data;
}

export async function getReworkRate(params: CompanyPeriodParams): Promise<MetricResponse<number>> {
  const res = await api.get('/dashboard/metrics/rework-rate', { params });
  return res.data;
}

export async function getDoctorAvgTimes(params: CompanyPeriodParams & { limit?: number }): Promise<MetricItemsResponse<number>> {
  const res = await api.get('/dashboard/metrics/doctor-avg-times', { params });
  return res.data;
}

export async function getSpecialtyHourDistribution(params: CompanyPeriodParams): Promise<MetricItemsResponse<number>> {
  const res = await api.get('/dashboard/metrics/specialty-hour-distribution', { params });
  return res.data;
}

export async function getServiceTimePercentiles(params: CompanyPeriodParams): Promise<MetricResponse<Record<string, number>>> {
  const res = await api.get('/dashboard/metrics/service-time-percentiles', { params });
  return res.data;
}

export async function getDailyVolumeStats(params: CompanyPeriodParams): Promise<MetricResponse<Record<string, number>>> {
  const res = await api.get('/dashboard/metrics/daily-volume-stats', { params });
  return res.data;
}

export async function getCompanyShare(params: { start_date: string; end_date: string }): Promise<MetricItemsResponse<number>> {
  const res = await api.get('/dashboard/metrics/company-share', { params });
  return res.data;
}

export async function getCompanyWeeklyTrend(params: { start_date: string; end_date: string }): Promise<MetricItemsResponse<number>> {
  const res = await api.get('/dashboard/metrics/company-weekly-trend', { params });
  return res.data;
}