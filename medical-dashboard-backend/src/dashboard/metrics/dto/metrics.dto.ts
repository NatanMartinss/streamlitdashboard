export interface CompanyPeriodDto {
  company_id?: number; // optional for multi-company endpoints
  start_date: string; // ISO date string
  end_date: string; // ISO date string
}

export interface MetricResponse<T = number> {
  metric: string;
  value: T;
  unit?: string;
  details?: Record<string, any>;
}

export interface MetricItemsResponse<T = number> {
  metric: string;
  items: Array<{ label: string; value: T; details?: Record<string, any> }>;
  unit?: string;
}