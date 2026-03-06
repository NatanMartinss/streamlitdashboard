import axios from 'axios';
import Cookies from 'js-cookie';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Criar instância do axios
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor para adicionar token de autenticação
api.interceptors.request.use(
  (config) => {
    const token = Cookies.get('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Interceptor para lidar com respostas
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expirado ou inválido
      Cookies.remove('access_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Tipos de dados
export interface User {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: string;
  company_id: number;
  company_name: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface DashboardData {
  kpis: {
    total_doctors: number;
    total_appointments: number;
    total_prescriptions: number;
    total_certificates: number;
    avg_service_time: number;
    growth_percentage: number;
  };
  top_doctors: Array<{
    name: string;
    appointments: number;
  }>;
  top_cid10: Array<{
    code: string;
    description: string;
    count: number;
  }>;
  top_specialties: Array<{
    name: string;
    count: number;
  }>;
  hourly_data: Array<{
    hora: number;
    mes_passado: number;
    mes_atual: number;
  }>;
  weekly_data: Array<{
    dia: number;
    dia_nome: string;
    mes_passado: number;
    mes_atual: number;
  }>;
}

export interface IndicatorsResponse {
  dayOfWeek: Array<{
    weekday: number;
    label: string;
    total: number;
    days_in_period: number;
    average_per_day: number;
  }>;
  hourOfDay: Array<{
    hour: number;
    label: string;
    total: number;
  }>;
  waitTimes: {
    total_protocols: number;
    covered_data_confirmation_wait: number;
    avg_data_confirmation_wait_minutes: number;
    covered_consultation_room_wait: number;
    avg_consultation_room_wait_minutes: number;
    covered_total_time: number;
    avg_total_time_minutes: number;
  } | null;
  serviceTimes: {
    confirmationMinutes: number;
    medicalMinutes: number;
  } | null;
  topDoctors: Array<{ doctor_name: string; appointments: number }>;
  topSpecialties: Array<{ name: string; count: number }>;
  topCid10: Array<{ cid10_value: string; count: number }>;
  companyAggregates: {
    topByVolume: Array<{ company_id: number; company_name: string; total_appointments: number }>;
    topByWait: Array<{ company_id: number; company_name: string; avg_wait_minutes: number; total_protocols: number }>;
  };
}

export interface WaitTimesResponse {
  counts?: {
    total: number;
    medicas: number;
    confirmacoes: number;
    receitas?: number;
    atestados?: number;
  };
  // Suporta ambos os nomes para compatibilidade
  dayOfWeek?: Array<{ weekday: number; label: string; total: number; days_in_period?: number; average_per_day?: number }>;
  dayOfWeekDistribution?: Array<{ weekday: number; label: string; total: number; days_in_period?: number; average_per_day?: number }>;
  hourOfDay?: Array<{ hour: number; label: string; total: number }>;
  hourOfDayDistribution?: Array<{ hour: number; label: string; total: number }>;
  waitTimes: {
    // Tempos gerais de espera (agenda -> execução)
    covered_total_time?: number;
    avg_total_time_minutes?: number;
    // Separação por confirmação e médico (novos campos)
    confirmation?: { covered: number; avg_minutes: number };
    medical?: { covered: number; avg_minutes: number };
    // Campos de protocolos (legado/tempo via protocol)
    total_protocols?: number;
    covered_data_confirmation_wait?: number;
    avg_data_confirmation_wait_minutes?: number;
    covered_consultation_room_wait?: number;
    avg_consultation_room_wait_minutes?: number;
  } | null;
  serviceTimes: {
    confirmationMinutes: number;
    medicalMinutes: number;
  } | null;
  topDoctors?: Array<{ doctor_name: string; appointments: number }>;
  topSpecialties?: Array<{ name: string; count: number }>;
}

// Funções da API
export const authAPI = {
  login: async (credentials: LoginRequest): Promise<LoginResponse> => {
    const response = await api.post('/auth/login', credentials);
    return response.data;
  },

  logout: async (): Promise<void> => {
    await api.post('/auth/logout');
    Cookies.remove('access_token');
  },

  getMe: async (): Promise<User> => {
    const response = await api.get('/auth/me');
    return response.data;
  },
};

export const dashboardAPI = {
  getDashboardData: async (
    companyId: number,
    startDate?: string,
    endDate?: string
  ): Promise<DashboardData> => {
    const params = new URLSearchParams();
    params.append('company_id', companyId.toString());
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    
    const response = await api.get(`/dashboard/stats?${params}`);
    return response.data;
  },

  getProtocolWaitTimes: async (
    companyId: number,
    startDate: string,
    endDate: string
  ): Promise<{
    total_protocols: number;
    total_attendances: number;
    avg_data_confirmation_wait_minutes: number;
    avg_consultation_room_wait_minutes: number;
    avg_total_time_minutes: number;
    covered_data_confirmation_wait: number;
    covered_consultation_room_wait: number;
    covered_total_time: number;
  }> => {
    const params = new URLSearchParams();
    params.append('company_id', companyId.toString());
    params.append('start_date', startDate);
    params.append('end_date', endDate);

    const response = await api.get(`/dashboard/protocol-wait-times?${params}`);
    return response.data;
  },

  getMonthlyComparison: async (companyId: number) => {
    const response = await api.get(`/dashboard/monthly-comparison?companyId=${companyId}`);
    return response.data;
  },

  getTopDoctors: async (
    companyId: number,
    startDate: string,
    endDate: string
  ) => {
    const params = new URLSearchParams();
    params.append('company_id', companyId.toString());
    params.append('start_date', startDate);
    params.append('end_date', endDate);
    
    const response = await api.get(`/dashboard/top-doctors?${params}`);
    return response.data;
  },

  getTopCid10: async (
    companyId: number,
    startDate: string,
    endDate: string
  ): Promise<Array<{ code: string; description: string; count: number }>> => {
    const params = new URLSearchParams();
    params.append('company_id', companyId.toString());
    params.append('start_date', startDate);
    params.append('end_date', endDate);
    
    const response = await api.get(`/dashboard/top-cid10?${params}`);
    return response.data;
  },

  getHourlyData: async (
    companyId: number,
    startDate: string,
    endDate: string
  ): Promise<{
    hourly_data: Array<{
      hora: number;
      mes_passado: number;
      mes_atual: number;
    }>;
    periodos: {
      mes_passado: string;
      mes_atual: string;
    };
  }> => {
    const params = new URLSearchParams();
    params.append('company_id', companyId.toString());
    params.append('start_date', startDate);
    params.append('end_date', endDate);
    
    const response = await api.get(`/dashboard/hourly-data?${params}`);
    return response.data;
  },

  getWeeklyData: async (
    companyId: number,
    startDate: string,
    endDate: string
  ): Promise<{
    weekly_data: Array<{
      dia: number;
      dia_nome: string;
      mes_passado: number;
      mes_atual: number;
    }>;
    periodos: {
      mes_passado: string;
      mes_atual: string;
    };
  }> => {
    const params = new URLSearchParams();
    params.append('company_id', companyId.toString());
    params.append('start_date', startDate);
    params.append('end_date', endDate);
    
    const response = await api.get(`/dashboard/weekly-data?${params}`);
    return response.data;
  },

  getComparativeData: async (): Promise<any> => {
    const response = await api.get('/reports/comparative-data');
    return response.data;
  },

  getIndicators: async (
    companyId: number,
    startDate: string,
    endDate: string
  ): Promise<IndicatorsResponse> => {
    const params = new URLSearchParams();
    params.append('company_id', companyId.toString());
    params.append('start_date', startDate);
    params.append('end_date', endDate);

    const response = await api.get(`/dashboard/indicators?${params}`);
    return response.data;
  },

  getWaitTimes: async (
    companyId: number,
    startDate: string,
    endDate: string,
    refresh = false
  ): Promise<WaitTimesResponse> => {
    const params = new URLSearchParams();
    params.append('company_id', companyId.toString());
    params.append('start_date', startDate);
    params.append('end_date', endDate);
    if (refresh) params.append('refresh', 'true');

    const response = await api.get(`/dashboard/wait-times?${params}`);
    return response.data;
  },

  getRealtimeHourlyAttendance: async (
    companyId: number,
    hours = 12
  ): Promise<Array<{ hour: string; total: number }>> => {
    const params = new URLSearchParams();
    params.append('company_id', companyId.toString());
    params.append('hours', hours.toString());

    const response = await api.get(`/realtime/hourly-attendance?${params}`);
    return response.data;
  },

  getRealtimeQueueStatus: async (
    companyId: number,
    hours = 6
  ): Promise<{
    totals: { waiting: number; ready: number; inAttendance: number };
    metrics: { averageWaitMinutes: number };
    protocols: Array<{
      protocol?: string;
      appointmentId?: string;
      name?: string;
      cpf?: string;
      nextGroup?: string;
      status: 'waiting' | 'ready' | 'in_attendance';
      lastEvent: string;
      lastUpdate: string;
      waitingSince?: string;
      minutesSinceLastUpdate: number;
    }>;
  }> => {
    const params = new URLSearchParams();
    params.append('company_id', companyId.toString());
    params.append('hours', hours.toString());

    const response = await api.get(`/realtime/queue-status?${params}`);
    return response.data;
  },

  getRealtimeRecentEvents: async (
    companyId: number,
    limit = 25
  ): Promise<
    Array<{
      id: number;
      protocol?: string;
      appointmentId?: string;
      name?: string;
      event: string;
      nextGroup?: string;
      timestamp: string;
    }>
  > => {
    const params = new URLSearchParams();
    params.append('company_id', companyId.toString());
    params.append('limit', limit.toString());

    const response = await api.get(`/realtime/recent-events?${params}`);
    return response.data;
  },

  generateReport: async (
    startDate?: string,
    endDate?: string
  ): Promise<Blob> => {
    const requestData = {
      start_date: startDate || new Date().toISOString().split('T')[0],
      end_date: endDate || new Date().toISOString().split('T')[0],
      report_type: 'complete'
    };
    
    const response = await api.post('/reports/generate-report', requestData, {
      responseType: 'blob',
    });
    return response.data;
  },

  // Novos endpoints de Tempo Real
  getRealtimeWaitTimeStats: async (
    companyId: number,
    hours = 6
  ): Promise<{
    confirmation: { count: number; avg: number; median: number; p90: number; p95: number; max: number };
    consultation: { count: number; avg: number; median: number; p90: number; p95: number; max: number };
    service: { count: number; avg: number; median: number; p90: number; p95: number; max: number };
  }> => {
    const params = new URLSearchParams();
    params.append('company_id', companyId.toString());
    params.append('hours', hours.toString());

    const response = await api.get(`/realtime/wait-time-stats?${params}`);
    return response.data;
  },

  getRealtimeTopDoctors: async (
    companyId: number,
    hours = 12
  ): Promise<Array<{ doctor_name: string; appointments: number }>> => {
    const params = new URLSearchParams();
    params.append('company_id', companyId.toString());
    params.append('hours', hours.toString());

    const response = await api.get(`/realtime/top-doctors?${params}`);
    return response.data;
  },

  getRealtimeTopSpecialties: async (
    companyId: number,
    hours = 12
  ): Promise<Array<{ name: string; count: number }>> => {
    const params = new URLSearchParams();
    params.append('company_id', companyId.toString());
    params.append('hours', hours.toString());

    const response = await api.get(`/realtime/top-specialties?${params}`);
    return response.data;
  },

  getRealtimeTopCid10: async (
    companyId: number,
    hours = 12
  ): Promise<Array<{ cid10: string; count: number }>> => {
    const params = new URLSearchParams();
    params.append('company_id', companyId.toString());
    params.append('hours', hours.toString());

    const response = await api.get(`/realtime/top-cid10?${params}`);
    return response.data;
  },

  getRealtimeCompaniesLeaderboard: async (
    hours = 12
  ): Promise<{
    topByVolume: Array<{ company_id: number; company_name: string; total_appointments: number }>;
    topByWait: Array<{ company_id: number; company_name: string; avg_wait_minutes: number; total_protocols: number }>;
  }> => {
    const params = new URLSearchParams();
    params.append('hours', hours.toString());

    const response = await api.get(`/realtime/companies-leaderboard?${params}`);
    return response.data;
  },
};

export default api;
