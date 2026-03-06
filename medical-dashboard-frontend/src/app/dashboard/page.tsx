'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../components/AuthProvider';
import { useRouter } from 'next/navigation';
import { dashboardAPI, DashboardData, IndicatorsResponse, WaitTimesResponse } from '../lib/api';
import {
  TopDoctorsChart,
  TopCID10Chart,
  TopSpecialtiesChart,
  KPICard,
  MonthlyComparisonChart,
  HourlyChart,
  WeeklyChart,
  SinglePeriodHourlyChart,
  SinglePeriodWeeklyChart,
  MonthlyComparisonDashboard,
  ComparisonTable,
  ComparisonTopDoctorsChart,
  ComparisonTopSpecialtiesChart,
} from '../components/DashboardCharts';
import ReportGenerator from '../components/ReportGenerator';
import { RealtimeDashboard } from '../components/RealtimeDashboard';
import {
  Activity,
  Users,
  Calendar,
  FileText,
  Pill,
  Clock,
  TrendingUp,
  Download,
  LogOut,
  Settings,
} from 'lucide-react';
import { format, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';
import ChartCard from '../components/ChartCard';

export default function DashboardPage() {
  const { user, logout, isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const isGestor = user?.role === 'admin';
  const isSuperAdmin = user?.role === 'super_admin';
  const formatCompanyName = (name?: string) => {
    if (!name) return '';
    const normalized = name.trim();
    return /eccosalva\s+emergencias\s+medicas/i.test(normalized)
      ? 'EccoSalva Emergencias Médicas'
      : normalized;
  };
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [indicators, setIndicators] = useState<IndicatorsResponse | null>(null);
  const [waitTimesPayload, setWaitTimesPayload] = useState<WaitTimesResponse | null>(null);
  const [protocolWaitTimes, setProtocolWaitTimes] = useState<{
    total_protocols: number;
    total_attendances: number;
    avg_data_confirmation_wait_minutes: number;
    avg_consultation_room_wait_minutes: number;
    avg_total_time_minutes: number;
    covered_data_confirmation_wait: number;
    covered_consultation_room_wait: number;
    covered_total_time: number;
  } | null>(null);
  const [comparisonData, setComparisonData] = useState<{
    current: DashboardData;
    previous: DashboardData;
    currentMonth: string;
    previousMonth: string;
    hourlyData?: any[];
    weeklyData?: any[];
  } | null>(null);
  const [monthlyComparison, setMonthlyComparison] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [dateRange, setDateRange] = useState({
    startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    endDate: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
  });
  const [tempDateRange, setTempDateRange] = useState({
    startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    endDate: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
  });

  // Helper: converte minutos (float) para string HH:MM:SS
  const formatMinutesToHHMMSS = (mins: number) => {
    if (!mins || isNaN(mins)) return '00:00:00';
    const totalSeconds = Math.round(mins * 60);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  };

  // Recalcula dias no período por dia da semana; usa backend como fonte primária
  const dayOfWeekData = useMemo(() => {
    if (!indicators?.dayOfWeek?.length) return [];
    try {
      // Fallback local: se backend não vier com days_in_period, computa em horário fixo (12:00 local)
      const start = new Date(dateRange.startDate);
      const end = new Date(dateRange.endDate);
      const days = eachDayOfInterval({ start, end });
      const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
      for (const d of days) {
        const wd = getDay(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12)); // 12:00 evita drift por fuso/DST
        counts[wd] = (counts[wd] || 0) + 1;
      }
      return indicators.dayOfWeek.map((item) => {
        // Backend usa DAYOFWEEK (1=Domingo ... 7=Sábado). Converter para índice JS.
        const jsWeekdayIndex = ((item.weekday - 1) % 7 + 7) % 7; // garante 0..6
        // Preferir valor do backend (já calculado em UTC-3); fallback para contagem local
        const daysInPeriod = (item as any).days_in_period ?? counts[jsWeekdayIndex] ?? 0;
        const avgPerDay = daysInPeriod ? item.total / daysInPeriod : 0;
        return {
          ...item,
          days_in_period: daysInPeriod,
          average_per_day: avgPerDay,
        };
      });
    } catch {
      return indicators.dayOfWeek;
    }
  }, [indicators, dateRange]);
  const hourOfDayData = useMemo(
    () =>
      (indicators?.hourOfDay ?? []).map((item) => ({
        hour: item.hour,
        label: item.label,
        total: item.total,
      })),
    [indicators]
  );
  const topVolumeCompanies = useMemo(
    () => indicators?.companyAggregates?.topByVolume ?? [],
    [indicators]
  );
  const topWaitCompanies = useMemo(
    () => indicators?.companyAggregates?.topByWait ?? [],
    [indicators]
  );
  const waitMetrics = indicators?.waitTimes ?? protocolWaitTimes ?? null;
  const serviceMetrics = indicators?.serviceTimes ?? null;

  const applyDateFilter = () => {
    setDateRange(tempDateRange);
  };

  const setPresetDateRange = (preset: string) => {
    const today = new Date();
    let startDate: Date;
    let endDate = today;

    switch (preset) {
      case '1day':
        startDate = today;
        break;
      case '7days':
        startDate = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '1month':
        startDate = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
        break;
      case '6months':
        startDate = new Date(today.getFullYear(), today.getMonth() - 6, today.getDate());
        break;
      default:
        startDate = startOfMonth(today);
        endDate = endOfMonth(today);
    }

    const newDateRange = {
      startDate: format(startDate, 'yyyy-MM-dd'),
      endDate: format(endDate, 'yyyy-MM-dd'),
    };

    setTempDateRange(newDateRange);
    setDateRange(newDateRange);
  };

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    if (isAuthenticated) {
      loadDashboardData();
      if (activeTab === 'comparison') {
        loadComparisonData();
      }
      if (activeTab === 'monthly-comparison') {
        loadMonthlyComparisonData();
      }
    }
  }, [isAuthenticated, dateRange, activeTab]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      if (!user?.company_id) {
        setError('ID da empresa não encontrado');
        return;
      }

      const waitTimesData = await dashboardAPI.getWaitTimes(
        user.company_id,
        dateRange.startDate,
        dateRange.endDate
      );

      // Armazena payload completo para KPIs e gráficos
      setWaitTimesPayload(waitTimesData);
      setIndicators({
        dayOfWeek: (waitTimesData?.dayOfWeek ?? waitTimesData?.dayOfWeekDistribution ?? []),
        hourOfDay: (waitTimesData?.hourOfDay ?? waitTimesData?.hourOfDayDistribution ?? []),
        waitTimes: waitTimesData?.waitTimes ?? null,
        serviceTimes: waitTimesData?.serviceTimes ?? null,
        topDoctors: waitTimesData?.topDoctors ?? [],
        topSpecialties: waitTimesData?.topSpecialties ?? [],
        topCid10: [],
        companyAggregates: { topByVolume: [], topByWait: [] },
      });
      setProtocolWaitTimes(waitTimesData?.waitTimes ?? null);
    } catch (error: any) {
      setError('Erro ao carregar dados do dashboard');
      console.error('Dashboard error:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadComparisonData = async () => {
    try {
      setLoading(true);

      if (!user?.company_id) {
        setError('ID da empresa não encontrado');
        return;
      }

      // Calcular mês atual e mês anterior
      const currentMonth = new Date();
      const previousMonth = subMonths(currentMonth, 1);

      const currentMonthStart = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
      const currentMonthEnd = format(endOfMonth(currentMonth), 'yyyy-MM-dd');
      const previousMonthStart = format(startOfMonth(previousMonth), 'yyyy-MM-dd');
      const previousMonthEnd = format(endOfMonth(previousMonth), 'yyyy-MM-dd');

      // Carregar dados dos dois meses e dados dos gráficos separadamente
      const [currentData, previousData, hourlyData, weeklyData] = await Promise.all([
        dashboardAPI.getDashboardData(user.company_id, currentMonthStart, currentMonthEnd),
        dashboardAPI.getDashboardData(user.company_id, previousMonthStart, previousMonthEnd),
        dashboardAPI.getHourlyData(user.company_id, currentMonthStart, currentMonthEnd),
        dashboardAPI.getWeeklyData(user.company_id, currentMonthStart, currentMonthEnd)
      ]);

      setComparisonData({
        current: currentData,
        previous: previousData,
        currentMonth: format(currentMonth, 'MMMM yyyy', { locale: ptBR }),
        previousMonth: format(previousMonth, 'MMMM yyyy', { locale: ptBR }),
        hourlyData: hourlyData.hourly_data,
        weeklyData: weeklyData.weekly_data
      });
    } catch (error: any) {
      setError('Erro ao carregar dados de comparação');
      console.error('Comparison error:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMonthlyComparisonData = async () => {
    try {
      setLoading(true);
      if (!user?.company_id) {
        setError('ID da empresa não encontrado');
        return;
      }

      const monthlyData = await dashboardAPI.getMonthlyComparison(user.company_id);
      setMonthlyComparison(monthlyData);
    } catch (error: any) {
      setError('Erro ao carregar dados de comparação mensal');
      console.error('Monthly comparison error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Carregando dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600">{error}</p>
          <button
            onClick={loadDashboardData}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="header-brand">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold">Dashboard Médico</h1>
              <p className="text-sm opacity-80">{formatCompanyName(user?.company_name)}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tabs */}
        <div className="mb-8">
          <div className="border-b border-white/20">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'dashboard'
                    ? 'border-bitcare-success text-bitcare-success'
                    : 'border-transparent text-bitcare-muted hover:text-white hover:border-white/30'
                  }`}
              >
                Dashboard Geral
              </button>
              <button
                onClick={() => setActiveTab('comparison')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'comparison'
                    ? 'border-bitcare-success text-bitcare-success'
                    : 'border-transparent text-bitcare-muted hover:text-white hover:border-white/30'
                  }`}
              >
                Mês Passado vs Mês Atual
              </button>
              {isSuperAdmin && (
                <button
                  onClick={() => setActiveTab('realtime')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'realtime'
                      ? 'border-bitcare-success text-bitcare-success'
                      : 'border-transparent text-bitcare-muted hover:text-white hover:border-white/30'
                    }`}
                >
                  Tempo Real
                </button>
              )}
              <button
                onClick={() => setActiveTab('monthly-comparison')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'monthly-comparison'
                    ? 'border-bitcare-success text-bitcare-success'
                    : 'border-transparent text-bitcare-muted hover:text-white hover:border-white/30'
                  }`}
              >
                Comparação Mensal Completa
              </button>
            </nav>
          </div>
        </div>

        {activeTab === 'dashboard' && (
          <>
            {/* Filtro de período + Relatório em um único card */}
            <div className="mb-6">
              <div className="bg-white p-6 rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.1)] border">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Relatório do Período</h3>

                {/* Presets de período */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Períodos Rápidos</label>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => setPresetDateRange('1day')} className="px-4 py-2 text-sm bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors">1 Dia</button>
                    <button onClick={() => setPresetDateRange('7days')} className="px-4 py-2 text-sm bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors">7 Dias</button>
                    <button onClick={() => setPresetDateRange('1month')} className="px-4 py-2 text-sm bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors">1 Mês</button>
                    <button onClick={() => setPresetDateRange('6months')} className="px-4 py-2 text-sm bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors">6 Meses</button>
                  </div>
                </div>

                {/* Inputs de data */}
                <div className="flex items-end space-x-4">
                  <div className="flex-1 max-w-xs">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Data Inicial</label>
                    <input type="date" value={tempDateRange.startDate} onChange={(e) => setTempDateRange(prev => ({ ...prev, startDate: e.target.value }))} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                  </div>
                  <div className="flex-1 max-w-xs">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Data Final</label>
                    <input type="date" value={tempDateRange.endDate} onChange={(e) => setTempDateRange(prev => ({ ...prev, endDate: e.target.value }))} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                  </div>
                  <button onClick={applyDateFilter} className="px-6 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors">Aplicar</button>
                </div>

                {/* Gerador de relatório */}
                <div className="mt-6">
                  <ReportGenerator startDate={dateRange.startDate} endDate={dateRange.endDate} />
                </div>
              </div>
            </div>

            {waitTimesPayload && (
              <>
                {/* Box Interpretativo removido conforme solicitação */}

                {/* Painel de Resultados Principais */}
                <div className="mb-8">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    📊 Painel de Resultados Principais
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <KPICard
                      title="Total de Atendimentos Médicos"
                      value={(waitTimesPayload?.counts?.medicas ?? 0).toLocaleString()}
                      icon={<Calendar className="h-6 w-6 text-white" />}
                      color="bg-bitcare-primary"
                    />
                    <KPICard
                      title="Receitas"
                      value={(waitTimesPayload?.counts?.receitas ?? 0).toLocaleString()}
                      icon={<Pill className="h-6 w-6 text-white" />}
                      color="bg-bitcare-primary"
                    />
                    <KPICard
                      title="Atestados"
                      value={(waitTimesPayload?.counts?.atestados ?? 0).toLocaleString()}
                      icon={<FileText className="h-6 w-6 text-white" />}
                      color="bg-bitcare-primary"
                    />
                    <KPICard
                      title="Total de Confirmações de Dados"
                      value={(waitTimesPayload?.counts?.confirmacoes ?? 0).toLocaleString()}
                      icon={<Clock className="h-6 w-6 text-white" />}
                      color="bg-bitcare-primary"
                    />
                  </div>
                </div>

                {/* Eficiência Operacional */}
                <div className="mb-8">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    ⚡ Eficiência Operacional
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <KPICard
                      title="Sinistro de Receitas"
                      value={`${(() => {
                        const total = waitTimesPayload?.counts?.total ?? 0;
                        const receitas = waitTimesPayload?.counts?.receitas ?? 0;
                        return total ? ((receitas / total) * 100).toFixed(2) + '%' : '0%';
                      })()}`}
                      icon={<Pill className="h-6 w-6 text-white" />}
                      color="bg-blue-500"
                    />
                    <KPICard
                      title="Sinistro de Atestados"
                      value={`${(() => {
                        const total = waitTimesPayload?.counts?.total ?? 0;
                        const atestados = waitTimesPayload?.counts?.atestados ?? 0;
                        return total ? ((atestados / total) * 100).toFixed(2) + '%' : '0%';
                      })()}`}
                      icon={<FileText className="h-6 w-6 text-white" />}
                      color="bg-orange-500"
                    />
                    <KPICard
                      title="Tempo de espera da confirmação"
                      value={`${formatMinutesToHHMMSS(
                        (waitMetrics?.confirmation?.avg_minutes ?? waitMetrics?.avg_data_confirmation_wait_minutes ?? 0)
                      )}`}
                      icon={<Clock className="h-6 w-6 text-white" />}
                      color="bg-purple-500"
                      subtitle={(() => {
                        const covered = waitMetrics?.confirmation?.covered ?? waitMetrics?.covered_data_confirmation_wait ?? 0;
                        return covered ? `Baseado em ${covered} amostras` : undefined;
                      })()}
                    />
                    <KPICard
                      title="Tempo de espera médico"
                      value={`${formatMinutesToHHMMSS(
                        (waitMetrics?.medical?.avg_minutes ?? waitMetrics?.avg_consultation_room_wait_minutes ?? 0)
                      )}`}
                      icon={<Clock className="h-6 w-6 text-white" />}
                      color="bg-teal-500"
                      subtitle={(() => {
                        const covered = waitMetrics?.medical?.covered ?? waitMetrics?.covered_consultation_room_wait ?? 0;
                        return covered ? `Baseado em ${covered} amostras` : undefined;
                      })()}
                    />
                  </div>
                </div>

                {/* Average Service Time Card */}
                <ChartCard title="Tempo Médio de Atendimento">
                  <div className="text-center">
                    <div className="flex items-center justify-center mb-4">
                      <div className="p-3 bg-blue-100 rounded-full">
                        <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                    </div>
                    <div className="text-5xl font-bold text-blue-600 mb-2">
                      {(indicators?.serviceTimes?.medicalMinutes ?? 0).toFixed ? (indicators?.serviceTimes?.medicalMinutes as number).toFixed(1) : (indicators?.serviceTimes?.medicalMinutes ?? 0)}
                      <span className="text-2xl text-gray-500 ml-2">min</span>
                    </div>
                    <p className="text-gray-600">
                      Tempo médio por consulta no período selecionado
                    </p>
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <div className="flex justify-center items-center space-x-4 text-sm text-gray-500">
                        <span>📊 Baseado em {(waitTimesPayload?.counts?.medicas ?? 0)} atendimentos</span>
                      </div>
                    </div>
                  </div>
                </ChartCard>

                {indicators && (
                  <div className="mb-8">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                      Indicadores de Frequencia
                    </h3>
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                      <ChartCard title="Consultas por dia da semana">
                        {dayOfWeekData.length ? (
                          <>
                            <table className="min-w-full divide-y divide-gray-200 text-sm">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Dia</th>
                                  <th className="px-4 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">Consultas</th>
                                  <th className="px-4 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">Dias no período</th>
                                  <th className="px-4 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">Media por dia</th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                {dayOfWeekData.map((item) => (
                                  <tr key={item.weekday}>
                                    <td className="px-4 py-2 text-gray-700">{item.label}</td>
                                    <td className="px-4 py-2 text-gray-900 text-right font-semibold">{item.total.toLocaleString()}</td>
                                    <td className="px-4 py-2 text-gray-700 text-right">{item.days_in_period}</td>
                                    <td className="px-4 py-2 text-gray-900 text-right font-semibold">{item.average_per_day.toFixed(2)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {/* Resumo para validar consistência */}
                            <div className="mt-3 text-xs text-gray-600">
                              {(() => {
                                const sum = dayOfWeekData.reduce((acc, it) => acc + (it.total || 0), 0);
                                const total = waitTimesPayload?.counts?.medicas || 0;
                                const diff = sum - total;
                                const ok = diff === 0;
                                return (
                                  <span className={ok ? 'text-gray-600' : 'text-red-600 font-medium'}>
                                    Total por semana: {sum} | Total de atendimentos médicos: {total}
                                    {!ok && ` (diferença ${diff > 0 ? '+' : ''}${diff})`}
                                  </span>
                                );
                              })()}
                            </div>
                          </>
                        ) : (
                           <p className="text-sm text-gray-500">Sem dados suficientes para o periodo.</p>
                        )}
                      </ChartCard>
                      <ChartCard title="Consultas por hora do dia">
                        {hourOfDayData.length ? (
                          <ResponsiveContainer width="100%" height={280}>
                            <BarChart data={hourOfDayData}>
                              <defs>
                                <linearGradient id="barGradientHourOfDay" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="#2563eb" stopOpacity={0.9} />
                                  <stop offset="100%" stopColor="#2563eb" stopOpacity={0.45} />
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                              <Tooltip formatter={(value: number) => [`${value} atend.`, 'Atendimentos']} />
                              <Bar dataKey="total" fill="url(#barGradientHourOfDay)" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        ) : (
                          <p className="text-sm text-gray-500">Sem dados suficientes para o periodo.</p>
                        )}
                      </ChartCard>
                    </div>
                  </div>
                )}
                {/* Distribuição (oculta para Gestor) */}
                {!isGestor && (
                  <div className="mb-8">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">📈 Distribuição</h3>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <TopDoctorsChart data={indicators?.topDoctors ?? []} />
                      <TopSpecialtiesChart data={indicators?.topSpecialties ?? []} />
                    </div>
                  </div>
                )}

                <div className="mb-8">
                  <TopCID10Chart data={indicators?.topCid10 ?? []} />
                </div>

                {/* Panorama por empresa (oculto para Gestor) */}
                {!isGestor && indicators && (topVolumeCompanies.length || topWaitCompanies.length) ? (
                  <div className="mb-12">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">Panorama por empresa</h3>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <ChartCard title="Mais atendimentos">
                        <ul className="space-y-3">
                          {topVolumeCompanies.map((company, index) => (
                            <li key={company.company_id} className="flex items-center justify-between">
                              <div>
                                <span className="text-sm font-semibold text-gray-900">#{index + 1} {company.company_name}</span>
                              </div>
                              <span className="text-sm text-gray-600">{company.total_appointments.toLocaleString()} atend.</span>
                            </li>
                          ))}
                          {!topVolumeCompanies.length && (
                            <li className="text-sm text-gray-500">Sem dados suficientes.</li>
                          )}
                        </ul>
                      </ChartCard>
                      <ChartCard title="Maior tempo medio de espera">
                        <ul className="space-y-3">
                          {topWaitCompanies.map((company, index) => (
                            <li key={company.company_id} className="flex items-center justify-between">
                              <div>
                                <span className="text-sm font-semibold text-gray-900">#{index + 1} {company.company_name}</span>
                              </div>
                              <span className="text-sm text-gray-600">{company.avg_wait_minutes.toFixed(1)} min</span>
                            </li>
                          ))}
                          {!topWaitCompanies.length && (
                            <li className="text-sm text-gray-500">Sem dados suficientes.</li>
                          )}
                        </ul>
                      </ChartCard>
                    </div>
                  </div>
                ) : null}
                {/* Removido: Padrões Temporais (HourlyChart) */}
              </>
            )}
          </>
        )}

        {activeTab === 'realtime' && user && isSuperAdmin && (
          <div className="space-y-6">
            <RealtimeDashboard companyId={user.company_id} />
          </div>
        )}

        {activeTab === 'comparison' && comparisonData && (
          <>
            {/* Comparison Header with Temporal Context */}
            <div className="mb-8 bg-white p-6 rounded-lg shadow-sm border">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">Comparação Mensal</h2>
                  <p className="text-gray-600 mb-3">
                    Comparando {comparisonData.previousMonth} vs {comparisonData.currentMonth}
                  </p>
                  <div className="flex items-center space-x-4 text-sm text-gray-500">
                    <span className="flex items-center">
                      📅 Período: 01 a 31 de cada mês
                    </span>
                    <span className="flex items-center">
                      🔄 Dados atualizados em {new Date().toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    ✅ Dados Completos
                  </div>
                </div>
              </div>
            </div>

            {/* Comparison Table */}
            <div className="mb-8">
              <ComparisonTable 
                currentData={comparisonData.current}
                previousData={comparisonData.previous}
                currentMonth={comparisonData.currentMonth}
                previousMonth={comparisonData.previousMonth}
              />
            </div>

            {/* KPIs Comparison */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <div className="bg-white p-6 rounded-lg shadow-sm border">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Médicos</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Mês Atual:</span>
                    <span className="font-medium">{comparisonData.current.kpis.total_doctors.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Mês Anterior:</span>
                    <span className="font-medium">{comparisonData.previous.kpis.total_doctors.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Diferença:</span>
                    <span className={`font-medium ${comparisonData.current.kpis.total_doctors >= comparisonData.previous.kpis.total_doctors
                        ? 'text-green-600' : 'text-red-600'
                      }`}>
                      {comparisonData.current.kpis.total_doctors - comparisonData.previous.kpis.total_doctors > 0 ? '+' : ''}
                      {comparisonData.current.kpis.total_doctors - comparisonData.previous.kpis.total_doctors}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-lg shadow-sm border">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Atendimentos</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Mês Atual:</span>
                    <span className="font-medium">{comparisonData.current.kpis.total_appointments.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Mês Anterior:</span>
                    <span className="font-medium">{comparisonData.previous.kpis.total_appointments.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Diferença:</span>
                    <span className={`font-medium ${comparisonData.current.kpis.total_appointments >= comparisonData.previous.kpis.total_appointments
                        ? 'text-green-600' : 'text-red-600'
                      }`}>
                      {comparisonData.current.kpis.total_appointments - comparisonData.previous.kpis.total_appointments > 0 ? '+' : ''}
                      {comparisonData.current.kpis.total_appointments - comparisonData.previous.kpis.total_appointments}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-lg shadow-sm border">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Receitas</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Mês Atual:</span>
                    <span className="font-medium">{comparisonData.current.kpis.total_prescriptions.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Mês Anterior:</span>
                    <span className="font-medium">{comparisonData.previous.kpis.total_prescriptions.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Diferença:</span>
                    <span className={`font-medium ${comparisonData.current.kpis.total_prescriptions >= comparisonData.previous.kpis.total_prescriptions
                        ? 'text-green-600' : 'text-red-600'
                      }`}>
                      {comparisonData.current.kpis.total_prescriptions - comparisonData.previous.kpis.total_prescriptions > 0 ? '+' : ''}
                      {comparisonData.current.kpis.total_prescriptions - comparisonData.previous.kpis.total_prescriptions}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-lg shadow-sm border">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Atestados</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Mês Atual:</span>
                    <span className="font-medium">{comparisonData.current.kpis.total_certificates.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Mês Anterior:</span>
                    <span className="font-medium">{comparisonData.previous.kpis.total_certificates.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Diferença:</span>
                    <span className={`font-medium ${comparisonData.current.kpis.total_certificates >= comparisonData.previous.kpis.total_certificates
                        ? 'text-green-600' : 'text-red-600'
                      }`}>
                      {comparisonData.current.kpis.total_certificates - comparisonData.previous.kpis.total_certificates > 0 ? '+' : ''}
                      {comparisonData.current.kpis.total_certificates - comparisonData.previous.kpis.total_certificates}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Charts Comparison */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <ComparisonTopDoctorsChart 
                currentData={comparisonData.current.top_doctors}
                previousData={comparisonData.previous.top_doctors}
                currentMonth={comparisonData.currentMonth}
                previousMonth={comparisonData.previousMonth}
              />
              <ComparisonTopSpecialtiesChart 
                currentData={comparisonData.current.top_specialties}
                previousData={comparisonData.previous.top_specialties}
                currentMonth={comparisonData.currentMonth}
                previousMonth={comparisonData.previousMonth}
              />
            </div>

            {/* Charts Grid - Hourly and Weekly */}
            {comparisonData.hourlyData && comparisonData.weeklyData && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                <HourlyChart data={comparisonData.hourlyData} />
                <WeeklyChart data={comparisonData.weeklyData} />
              </div>
            )}
          </>
        )}

        {activeTab === 'monthly-comparison' && monthlyComparison && (
          <MonthlyComparisonDashboard data={monthlyComparison} />
        )}
      </main>
    </div>
  );
}
