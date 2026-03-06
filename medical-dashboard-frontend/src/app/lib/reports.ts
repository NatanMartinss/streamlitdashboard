import api from './api';

export interface ReportFilters {
  companyId: number;
  startDate: string;
  endDate: string;
  doctorName?: string;
  specialty?: string;
  cid10Value?: string;
}

export interface DoctorReport {
  doctor_name: string;
  total_appointments: number;
  total_time: number;
  avg_time: number;
  specialties: string[];
}

export interface DetailedAppointment {
  id: number;
  appointment_date: string;
  appointment_time: string;
  doctor_name: string;
  specialty: string;
  cid10_code: string;
  patient_age: number;
  patient_gender: string;
  status: string;
}

export interface SpecialtyReport {
  specialty: string;
  total_appointments: number;
  total_time: number;
  avg_time: number;
  doctors: string[];
}

export interface Cid10Report {
  cid10_code: string;
  cid10_category: string;
  cid10_subcategory: string;
  total_appointments: number;
  doctors: string[];
}

export interface MonthlyComparison {
  current_month: {
    month: string;
    total_appointments: number;
    total_time: number;
    avg_time: number;
  };
  previous_month: {
    month: string;
    total_appointments: number;
    total_time: number;
    avg_time: number;
  };
  growth: {
    appointments_growth: number;
    time_growth: number;
  };
}

export const reportsAPI = {
  getDoctorReport: async (filters: ReportFilters): Promise<DoctorReport[]> => {
    const params = new URLSearchParams();
    params.append('company_id', filters.companyId.toString());
    params.append('start_date', filters.startDate);
    params.append('end_date', filters.endDate);
    if (filters.doctorName) params.append('doctor_name', filters.doctorName);
    
    const response = await api.get(`/reports/doctor?${params}`);
    return response.data;
  },

  getDetailedAppointments: async (filters: ReportFilters): Promise<DetailedAppointment[]> => {
    const params = new URLSearchParams();
    params.append('company_id', filters.companyId.toString());
    params.append('start_date', filters.startDate);
    params.append('end_date', filters.endDate);
    if (filters.doctorName) params.append('doctor_name', filters.doctorName);
    if (filters.specialty) params.append('specialty', filters.specialty);
    
    const response = await api.get(`/reports/detailed-appointments?${params}`);
    return response.data;
  },

  getSpecialtyReport: async (filters: ReportFilters): Promise<SpecialtyReport[]> => {
    const params = new URLSearchParams();
    params.append('company_id', filters.companyId.toString());
    params.append('start_date', filters.startDate);
    params.append('end_date', filters.endDate);
    if (filters.specialty) params.append('specialty', filters.specialty);
    
    const response = await api.get(`/reports/specialty?${params}`);
    return response.data;
  },

  getCid10Report: async (filters: ReportFilters): Promise<Cid10Report[]> => {
    const params = new URLSearchParams();
    params.append('company_id', filters.companyId.toString());
    params.append('start_date', filters.startDate);
    params.append('end_date', filters.endDate);
    if (filters.cid10Value) params.append('cid10_value', filters.cid10Value);
    
    const response = await api.get(`/reports/cid10?${params}`);
    return response.data;
  },

  getMonthlyComparison: async (
    companyId: number,
    currentMonth: string,
    previousMonth: string
  ): Promise<MonthlyComparison> => {
    const params = new URLSearchParams();
    params.append('company_id', companyId.toString());
    params.append('current_month', currentMonth);
    params.append('previous_month', previousMonth);
    
    const response = await api.get(`/reports/monthly-comparison?${params}`);
    return response.data;
  },
};