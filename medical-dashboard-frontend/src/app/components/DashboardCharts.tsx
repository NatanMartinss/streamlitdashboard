'use client';

import { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import ChartCard from './ChartCard';

// Cores padronizadas para indicadores
const INDICATOR_COLORS = {
  positive: '#10B981', // Verde para crescimento
  negative: '#EF4444', // Vermelho para queda
  neutral: '#6B7280',  // Cinza para neutro
};

// Cores para os gráficos
const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'];

interface ChartData {
  name: string;
  value: number;
  count?: number;
  appointments?: number;
}

interface TopDoctorsChartProps {
  data: Array<{
    doctor_name: string;
    appointments: number;
  }>;
}

export function TopDoctorsChart({ data }: TopDoctorsChartProps) {
  // Verificar se data existe e é um array antes de fazer o map
  if (!data || !Array.isArray(data) || data.length === 0) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Top 10 Médicos</h3>
        <div className="flex items-center justify-center h-[300px] text-gray-500">
          Nenhum dado disponível
        </div>
      </div>
    );
  }

  const chartData = data.map(item => ({
    name: (item.doctor_name && typeof item.doctor_name === 'string' && item.doctor_name.length > 15) 
      ? item.doctor_name.substring(0, 15) + '...' 
      : (item.doctor_name || 'N/A'),
    appointments: item.appointments || 0,
  }));

  return (
    <ChartCard title="Top 10 Médicos">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <defs>
            <linearGradient id="barGradientTopDoctors" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.65} />
              <stop offset="100%" stopColor="#3B82F6" stopOpacity={0.25} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis 
            dataKey="name" 
            angle={-45}
            textAnchor="end"
            height={80}
            fontSize={12}
          />
          <YAxis />
          <Tooltip />
          <Bar dataKey="appointments" fill="url(#barGradientTopDoctors)" />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

interface TopCID10ChartProps {
  data: Array<{
    // Suporta ambos formatos vindos de diferentes fontes
    cid10_value?: string; // indicadores
    code?: string;        // dashboardData
    description?: string; // dashboardData
    count: number;
  }>;
}

export function TopCID10Chart({ data }: TopCID10ChartProps) {
  const [query, setQuery] = useState('');

  // Normaliza os dados e aplica ordenação por count
  const normalized = useMemo(() => {
    if (!data || !Array.isArray(data)) return [];
    return data
      .map((item) => {
        const label = item.cid10_value || item.description || item.code || 'N/A';
        return {
          rawLabel: label,
          name:
            label && label.length > 40 ? label.substring(0, 40) + '…' : label,
          count: item.count || 0,
        };
      })
      .sort((a, b) => b.count - a.count);
  }, [data]);

  // Filtro por pesquisa e limitador de top 5
  const chartData = useMemo(() => {
    const filtered = query
      ? normalized.filter((i) => i.rawLabel.toLowerCase().includes(query.toLowerCase()))
      : normalized;
    return filtered.slice(0, 5);
  }, [normalized, query]);

  if (!chartData.length) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Top 5 CID10</h3>
        <div className="mb-4">
          <input
            type="text"
            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Pesquisar CID10 por código ou descrição"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center justify-center h-[200px] text-gray-500">
          Nenhum dado encontrado
        </div>
      </div>
    );
  }

  return (
    <ChartCard title="Top 5 CID10">
      <div className="mb-4">
        <input
          type="text"
          className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Pesquisar CID10 por código ou descrição"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
          <defs>
            <linearGradient id="barGradientCID10" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10B981" stopOpacity={0.65} />
              <stop offset="100%" stopColor="#10B981" stopOpacity={0.25} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} fontSize={10} />
          <YAxis />
          <Tooltip />
          <Bar dataKey="count" fill="url(#barGradientCID10)" />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

interface TopSpecialtiesChartProps {
  data: Array<{
    name: string;
    count: number;
  }>;
}

export function TopSpecialtiesChart({ data }: TopSpecialtiesChartProps) {
  // Verificar se data existe e é um array antes de fazer o map
  if (!data || !Array.isArray(data) || data.length === 0) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Top 10 Especialidades</h3>
        <div className="flex items-center justify-center h-[300px] text-gray-500">
          Nenhum dado disponível
        </div>
      </div>
    );
  }

  const chartData = data.map(item => ({
    name: (item.name && typeof item.name === 'string' && item.name.length > 15) 
      ? item.name.substring(0, 15) + '...' 
      : (item.name || 'N/A'),
    count: item.count || 0,
  }));

  return (
    <ChartCard title="Especialidades Médicas">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <defs>
            <linearGradient id="barGradientSpecialties" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10B981" stopOpacity={0.65} />
              <stop offset="100%" stopColor="#10B981" stopOpacity={0.25} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis 
            dataKey="name" 
            angle={-45}
            textAnchor="end"
            height={80}
            fontSize={12}
          />
          <YAxis />
          <Tooltip />
          <Bar dataKey="count" fill="url(#barGradientSpecialties)" />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

interface KPICardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  color?: string;
  growth?: number;
  subtitle?: string; // linha informativa opcional
}

export function KPICard({ title, value, icon, color = 'bg-bitcare-primary', growth, subtitle }: KPICardProps) {
  const growthColor = !growth || growth === 0 ? 'text-white/70' : growth > 0 ? 'text-bitcare-success' : 'text-bitcare-danger';

  return (
    <div className="bg-bitcare-dark text-white rounded-2xl p-4 shadow-inner transition-transform duration-200 hover:scale-[1.02]">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-sm opacity-75 mb-1">{title}</p>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold">{value}</p>
            {growth !== undefined && (
              <div className={`text-xs font-semibold ${growthColor} flex items-center gap-1`}>
                <span>{growth > 0 ? '↑' : growth < 0 ? '↓' : '→'}</span>
                <span>{Math.abs(growth).toFixed(1)}%</span>
              </div>
            )}
          </div>
          {growth !== undefined && (
            <p className="text-xs text-white/60 mt-1">vs mês anterior</p>
          )}
          {subtitle && (
            <p className="text-xs text-white/70 mt-1">{subtitle}</p>
          )}
        </div>
        <div className={`p-3 rounded-full ${color}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

interface MonthlyComparisonChartProps {
  data: Array<{
    month: string;
    current: number;
    previous: number;
  }>;
  title: string;
  dataKey1: string;
  dataKey2: string;
}

export function MonthlyComparisonChart({ 
  data, 
  title, 
  dataKey1, 
  dataKey2 
}: MonthlyComparisonChartProps) {
  return (
    <ChartCard title={title}>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <defs>
            <linearGradient id="barGradientMonthlyCurrent" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.65} />
              <stop offset="100%" stopColor="#3B82F6" stopOpacity={0.25} />
            </linearGradient>
            <linearGradient id="barGradientMonthlyPrevious" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10B981" stopOpacity={0.65} />
              <stop offset="100%" stopColor="#10B981" stopOpacity={0.25} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis />
          <Tooltip />
          <Bar dataKey={dataKey1} fill="url(#barGradientMonthlyCurrent)" name="Mês Atual" />
          <Bar dataKey={dataKey2} fill="url(#barGradientMonthlyPrevious)" name="Mês Anterior" />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}



interface SinglePeriodHourlyChartProps {
  data: Array<{
    hora: number;
    consultas: number;
  }>;
}

export function SinglePeriodHourlyChart({ data }: SinglePeriodHourlyChartProps) {
  // Verificar se data existe e é um array antes de fazer o map
  if (!data || !Array.isArray(data) || data.length === 0) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Consultas por Hora</h3>
        <div className="flex items-center justify-center h-[300px] text-gray-500">
          Nenhum dado disponível
        </div>
      </div>
    );
  }

  const chartData = data.map(item => ({
    hour: `${item.hora}h`,
    consultas: item.consultas,
  }));

  return (
    <ChartCard title="Consultas por Hora">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <defs>
            <linearGradient id="barGradientSingleHourly" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.65} />
              <stop offset="100%" stopColor="#3B82F6" stopOpacity={0.25} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="hour" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="consultas" fill="url(#barGradientSingleHourly)" name="Consultas" />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

interface SinglePeriodWeeklyChartProps {
  data: Array<{
    dia: number;
    dia_nome: string;
    consultas: number;
  }>;
}

// Adicionar após o componente SinglePeriodWeeklyChart
interface MonthlyComparisonDashboardProps {
  data: {
    periodo: {
      mesAtual: { mes: number; ano: number; inicio: string; fim: string };
      mesAnterior: { mes: number; ano: number; inicio: string; fim: string };
    };
    indicadores: {
      atendimentos: { mesAtual: number; mesAnterior: number; diferenca: number; percentual: number };
      receitas: { mesAtual: number; mesAnterior: number; diferenca: number; percentual: number };
      atestados: { mesAtual: number; mesAnterior: number; diferenca: number; percentual: number };
      medicos: { mesAtual: number; mesAnterior: number; diferenca: number; percentual: number };
      tempoEsperaProtocolo: { mesAtual: number; mesAnterior: number; diferenca: number; percentual: number };
      tempoEsperaConsulta: { mesAtual: number; mesAnterior: number; diferenca: number; percentual: number };
    };
    graficos: {
      topMedicos: { mesAtual: any[]; mesAnterior: any[] };
      topEspecialidades: { mesAtual: any[]; mesAnterior: any[] };
      dadosSemanais: { mesAtual: any[]; mesAnterior: any[] };
      dadosHorarios: { mesAtual: any[]; mesAnterior: any[] };
    };
  };
}

export function MonthlyComparisonDashboard({ data }: MonthlyComparisonDashboardProps) {
  const getMonthName = (month: number) => {
    const months = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    return months[month - 1] || 'Mês';
  };

  if (!data || !data.periodo) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Comparação Mensal</h2>
        <div className="flex items-center justify-center h-[200px] text-gray-500">
          Nenhum dado disponível
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header com informações do período */}
      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Comparação Mensal</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <h3 className="font-semibold text-blue-900">Mês Atual</h3>
            <p className="text-lg text-blue-700">
              {getMonthName(data.periodo.mesAtual.mes)} {data.periodo.mesAtual.ano}
            </p>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <h3 className="font-semibold text-green-900">Mês Anterior</h3>
            <p className="text-lg text-green-700">
              {getMonthName(data.periodo.mesAnterior.mes)} {data.periodo.mesAnterior.ano}
            </p>
          </div>
        </div>
      </div>

      {/* KPIs principais */}
      {/* Linha superior com três KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <KPICard
          title="Total de Atendimentos"
          value={data.indicadores.atendimentos.mesAtual}
          icon="👥"
          color="border-blue-500"
          growth={data.indicadores.atendimentos.percentual}
        />
        <KPICard
          title="Receitas Emitidas"
          value={data.indicadores.receitas.mesAtual}
          icon="💊"
          color="border-green-500"
          growth={data.indicadores.receitas.percentual}
        />
        <KPICard
          title="Atestados Emitidos"
          value={data.indicadores.atestados.mesAtual}
          icon="📋"
          color="border-yellow-500"
          growth={data.indicadores.atestados.percentual}
        />
      </div>

      {/* Linha inferior centralizada com dois KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:max-w-4xl mx-auto">
        <KPICard
          title="Tempo Espera Protocolo (min)"
          value={data.indicadores.tempoEsperaProtocolo.mesAtual.toFixed(1)}
          icon="⏱️"
          color="border-orange-500"
          growth={data.indicadores.tempoEsperaProtocolo.percentual}
        />
        <KPICard
          title="Tempo Espera Consulta (min)"
          value={data.indicadores.tempoEsperaConsulta.mesAtual.toFixed(1)}
          icon="🕐"
          color="border-red-500"
          growth={data.indicadores.tempoEsperaConsulta.percentual}
        />
      </div>

      {/* Gráficos de comparação */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Médicos Comparação */}
        <ChartCard title="Top Médicos - Comparação">
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-blue-600 mb-2">
                {getMonthName(data.periodo.mesAtual.mes)} {data.periodo.mesAtual.ano}
              </h4>
              <TopDoctorsChart data={data.graficos.topMedicos.mesAtual.slice(0, 5)} />
            </div>
            <div>
              <h4 className="text-sm font-medium text-green-600 mb-2">
                {getMonthName(data.periodo.mesAnterior.mes)} {data.periodo.mesAnterior.ano}
              </h4>
              <TopDoctorsChart data={data.graficos.topMedicos.mesAnterior.slice(0, 5)} />
            </div>
          </div>
        </ChartCard>

        {/* Top Especialidades Comparação */}
        <ChartCard title="Top Especialidades - Comparação">
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-blue-600 mb-2">
                {getMonthName(data.periodo.mesAtual.mes)} {data.periodo.mesAtual.ano}
              </h4>
              <TopSpecialtiesChart data={data.graficos.topEspecialidades.mesAtual.slice(0, 5)} />
            </div>
            <div>
              <h4 className="text-sm font-medium text-green-600 mb-2">
                {getMonthName(data.periodo.mesAnterior.mes)} {data.periodo.mesAnterior.ano}
              </h4>
              <TopSpecialtiesChart data={data.graficos.topEspecialidades.mesAnterior.slice(0, 5)} />
            </div>
          </div>
        </ChartCard>
      </div>

      {/* Gráficos de dados temporais */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Dados Semanais */}
        {data.graficos.dadosSemanais.mesAtual.length > 0 && (
          <WeeklyChart data={data.graficos.dadosSemanais.mesAtual} />
        )}
        
        {/* Dados Horários */}
        {data.graficos.dadosHorarios.mesAtual.length > 0 && (
          <HourlyChart data={data.graficos.dadosHorarios.mesAtual} />
        )}
      </div>
    </div>
  );
}

interface HourlyChartProps {
  data: Array<{
    hora: number;
    mes_atual: number;
    mes_passado: number;
  }>;
}

export function HourlyChart({ data }: HourlyChartProps) {
  // Verificar se data existe e é um array antes de fazer o map
  if (!data || !Array.isArray(data) || data.length === 0) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Consultas por Hora (24h)</h3>
        <div className="flex items-center justify-center h-[300px] text-gray-500">
          Nenhum dado disponível
        </div>
      </div>
    );
  }

  const chartData = data.map(item => ({
    hour: `${item.hora}:00`,
    current: item.mes_atual,
    previous: item.mes_passado || 0,
  }));

  // Calcular o valor máximo para normalizar a escala Y
  const maxCurrent = Math.max(...chartData.map(item => item.current));
  const maxPrevious = Math.max(...chartData.map(item => item.previous));
  const maxValue = Math.max(maxCurrent, maxPrevious);
  const yAxisMax = Math.ceil(maxValue * 1.1); // 10% de margem

  return (
    <ChartCard title="Consultas por Hora (24h)">
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="hour" />
          <YAxis domain={[0, yAxisMax]} />
          <Tooltip />
          <Line 
            type="monotone" 
            dataKey="current" 
            stroke={INDICATOR_COLORS.positive}
            strokeWidth={2}
            name="Mês Atual"
          />
          <Line 
            type="monotone" 
            dataKey="previous" 
            stroke={INDICATOR_COLORS.neutral}
            strokeWidth={2}
            strokeDasharray="5 5"
            name="Mês Anterior"
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

interface WeeklyChartProps {
  data: Array<{
    dia: number;
    dia_nome: string;
    mes_atual: number;
    mes_passado: number;
  }>;
}

export function WeeklyChart({ data }: WeeklyChartProps) {
  // Verificar se data existe e é um array antes de fazer o map
  if (!data || !Array.isArray(data) || data.length === 0) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Consultas por Dia da Semana</h3>
        <div className="flex items-center justify-center h-[300px] text-gray-500">
          Nenhum dado disponível
        </div>
      </div>
    );
  }

  const chartData = data.map(item => ({
    day: item.dia_nome || 'N/A',
    current: item.mes_atual,
    previous: item.mes_passado || 0,
  }));

  // Normalizar Y considerando ambos os meses
  const maxCurrent = Math.max(...chartData.map(item => item.current));
  const maxPrevious = Math.max(...chartData.map(item => item.previous));
  const maxValue = Math.max(maxCurrent, maxPrevious);
  const yAxisMax = Math.ceil(maxValue * 1.1);

  return (
    <ChartCard title="Consultas por Dia da Semana">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <defs>
            <linearGradient id="barGradientWeeklyCurrent" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10B981" stopOpacity={0.65} />
              <stop offset="100%" stopColor="#10B981" stopOpacity={0.25} />
            </linearGradient>
            <linearGradient id="barGradientWeeklyPrevious" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6B7280" stopOpacity={0.55} />
              <stop offset="100%" stopColor="#6B7280" stopOpacity={0.2} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="day" />
          <YAxis domain={[0, yAxisMax]} />
          <Tooltip />
          <Bar dataKey="current" fill="url(#barGradientWeeklyCurrent)" name="Mês Atual" />
          <Bar dataKey="previous" fill="url(#barGradientWeeklyPrevious)" name="Mês Anterior" />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// Novo componente para tabela de comparação lado a lado
interface ComparisonTableProps {
  currentData: any;
  previousData: any;
  currentMonth: string;
  previousMonth: string;
}

export function ComparisonTable({ currentData, previousData, currentMonth, previousMonth }: ComparisonTableProps) {
  const calculateVariation = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  };

  const formatVariation = (variation: number) => {
    const sign = variation >= 0 ? '+' : '';
    return `${sign}${variation.toFixed(2)}%`;
  };

  const getVariationColor = (variation: number) => {
    if (variation > 0) return 'text-green-600';
    if (variation < 0) return 'text-red-600';
    return 'text-gray-600';
  };

  const getVariationIcon = (variation: number) => {
    if (variation > 0) return '🟢 ↗';
    if (variation < 0) return '🔴 ↘';
    return '⚪ →';
  };

  const metrics = [
    {
      label: 'Total de Atendimentos',
      current: currentData?.total_attendances || 0,
      previous: previousData?.total_attendances || 0,
    },
    {
      label: 'Receitas Emitidas',
      current: currentData?.total_prescriptions || 0,
      previous: previousData?.total_prescriptions || 0,
    },
    {
      label: 'Atestados Emitidos',
      current: currentData?.total_certificates || 0,
      previous: previousData?.total_certificates || 0,
    },
    {
      label: 'Pacientes Únicos',
      current: currentData?.unique_patients || 0,
      previous: previousData?.unique_patients || 0,
    },
    {
      label: 'Médicos Ativos',
      current: currentData?.active_doctors || 0,
      previous: previousData?.active_doctors || 0,
    },
    {
      label: 'Tempo Médio de Protocolo (min)',
      current: currentData?.avg_protocol_time || 0,
      previous: previousData?.avg_protocol_time || 0,
    },
    {
      label: 'Tempo Médio de Consulta (min)',
      current: currentData?.avg_consultation_time || 0,
      previous: previousData?.avg_consultation_time || 0,
    },
  ];

  return (
    <ChartCard title="Comparação Mensal">
      <div className="mb-6">
        <p className="text-sm text-gray-600">
          Período analisado: {previousMonth} vs {currentMonth}
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Dados atualizados em {new Date().toLocaleDateString('pt-BR')}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-3 px-4 font-semibold text-gray-900">Métrica</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-900">{previousMonth}</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-900">{currentMonth}</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-900">Variação</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((metric, index) => {
              const variation = calculateVariation(metric.current, metric.previous);
              return (
                <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-4 px-4 font-medium text-gray-900">{metric.label}</td>
                  <td className="py-4 px-4 text-center text-gray-700 font-mono">
                    {metric.previous.toLocaleString('pt-BR')}
                  </td>
                  <td className="py-4 px-4 text-center font-mono">
                    <span className="font-semibold text-gray-900">
                      {metric.current.toLocaleString('pt-BR')}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-center">
                    <div className="flex items-center justify-center space-x-2">
                      <span className="text-lg">{getVariationIcon(variation)}</span>
                      <span className={`font-semibold font-mono ${getVariationColor(variation)}`}>
                        {formatVariation(variation)}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Seção de insights automáticos */}
      <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <h4 className="font-semibold text-blue-900 mb-2">📈 Resumo Executivo</h4>
        <p className="text-sm text-blue-800">
          {(() => {
            const attendancesVar = calculateVariation(
              currentData?.total_attendances || 0,
              previousData?.total_attendances || 0
            );
            const prescriptionsVar = calculateVariation(
              currentData?.total_prescriptions || 0,
              previousData?.total_prescriptions || 0
            );
            const protocolTimeVar = calculateVariation(
              currentData?.avg_protocol_time || 0,
              previousData?.avg_protocol_time || 0
            );

            if (attendancesVar > 0 && prescriptionsVar > 0) {
              return `${currentMonth} superou ${previousMonth} nos indicadores principais. Volume de atendimentos cresceu ${attendancesVar.toFixed(1)}% e receitas ${prescriptionsVar.toFixed(1)}%. ${protocolTimeVar < 0 ? `Tempo de protocolo melhorou ${Math.abs(protocolTimeVar).toFixed(1)}%.` : `Atenção: tempo de protocolo aumentou ${protocolTimeVar.toFixed(1)}%.`}`;
            } else if (attendancesVar < 0) {
              return `${currentMonth} apresentou queda no volume de atendimentos (${attendancesVar.toFixed(1)}%). Recomenda-se análise das causas e ações corretivas.`;
            } else {
              return `${currentMonth} manteve estabilidade nos indicadores principais comparado a ${previousMonth}.`;
            }
          })()}
        </p>
      </div>
    </ChartCard>
  );
}

// Novos componentes para comparação direta com barras duplas
interface ComparisonTopDoctorsChartProps {
  currentData: Array<{
    doctor_name: string;
    appointments: number;
  }>;
  previousData: Array<{
    doctor_name: string;
    appointments: number;
  }>;
  currentMonth: string;
  previousMonth: string;
}

export function ComparisonTopDoctorsChart({ 
  currentData, 
  previousData, 
  currentMonth, 
  previousMonth 
}: ComparisonTopDoctorsChartProps) {
  if (!currentData || !previousData || currentData.length === 0) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Médicos - Comparação</h3>
        <div className="flex items-center justify-center h-[300px] text-gray-500">
          Nenhum dado disponível
        </div>
      </div>
    );
  }

  // Combinar dados dos dois meses
  const combinedData = currentData.slice(0, 5).map(current => {
    const previous = previousData.find(p => p.doctor_name === current.doctor_name);
    return {
      name: current.doctor_name && current.doctor_name.length > 15 
        ? current.doctor_name.substring(0, 15) + '...' 
        : current.doctor_name || 'N/A',
      [currentMonth]: current.appointments || 0,
      [previousMonth]: previous?.appointments || 0,
    };
  });

  // Calcular escala máxima para normalização
  const maxValue = Math.max(
    ...combinedData.map(item => Math.max(item[currentMonth], item[previousMonth]))
  );
  const yAxisMax = Math.ceil(maxValue * 1.1);

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Médicos - Comparação</h3>
      <ResponsiveContainer width="100%" height={350}>
        <BarChart 
          data={combinedData} 
          margin={{ top: 20, right: 30, left: 20, bottom: 80 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis 
            dataKey="name" 
            angle={-45}
            textAnchor="end"
            height={80}
            fontSize={11}
          />
          <YAxis domain={[0, yAxisMax]} />
          <Tooltip />
          <Legend />
          <Bar 
            dataKey={currentMonth} 
            fill={INDICATOR_COLORS.positive} 
            name={currentMonth}
            radius={[2, 2, 0, 0]}
          />
          <Bar 
            dataKey={previousMonth} 
            fill={INDICATOR_COLORS.neutral} 
            name={previousMonth}
            radius={[2, 2, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

interface ComparisonTopSpecialtiesChartProps {
  currentData: Array<{
    name: string;
    count: number;
  }>;
  previousData: Array<{
    name: string;
    count: number;
  }>;
  currentMonth: string;
  previousMonth: string;
}

export function ComparisonTopSpecialtiesChart({ 
  currentData, 
  previousData, 
  currentMonth, 
  previousMonth 
}: ComparisonTopSpecialtiesChartProps) {
  if (!currentData || !previousData || currentData.length === 0) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Especialidades - Comparação</h3>
        <div className="flex items-center justify-center h-[300px] text-gray-500">
          Nenhum dado disponível
        </div>
      </div>
    );
  }

  // Combinar dados dos dois meses
  const combinedData = currentData.slice(0, 5).map(current => {
    const previous = previousData.find(p => p.name === current.name);
    return {
      name: current.name && current.name.length > 15 
        ? current.name.substring(0, 15) + '...' 
        : current.name || 'N/A',
      [currentMonth]: current.count || 0,
      [previousMonth]: previous?.count || 0,
    };
  });

  // Calcular escala máxima para normalização
  const maxValue = Math.max(
    ...combinedData.map(item => Math.max(item[currentMonth], item[previousMonth]))
  );
  const yAxisMax = Math.ceil(maxValue * 1.1);

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Especialidades - Comparação</h3>
      <ResponsiveContainer width="100%" height={350}>
        <BarChart 
          data={combinedData} 
          margin={{ top: 20, right: 30, left: 20, bottom: 80 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis 
            dataKey="name" 
            angle={-45}
            textAnchor="end"
            height={80}
            fontSize={11}
          />
          <YAxis domain={[0, yAxisMax]} />
          <Tooltip />
          <Legend />
          <Bar 
            dataKey={currentMonth} 
            fill={INDICATOR_COLORS.positive} 
            name={currentMonth}
            radius={[2, 2, 0, 0]}
          />
          <Bar 
            dataKey={previousMonth} 
            fill={INDICATOR_COLORS.neutral} 
            name={previousMonth}
            radius={[2, 2, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}