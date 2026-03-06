'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { io, Socket } from 'socket.io-client';
import {
  ResponsiveContainer,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Bar,
} from 'recharts';
import { API_BASE_URL, dashboardAPI } from '../lib/api';
import { COMPANY_MAP } from '../lib/companyMap';
import { Loader2, Activity, Clock, Users, Zap } from 'lucide-react';
import ChartCard from './ChartCard';

interface RealtimeDashboardProps {
  companyId: number;
}

interface HourlyPoint {
  hour: string;
  total: number;
}

interface ProtocolRow {
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
  companyId?: number;
  companyName?: string;
}

const STATUS_LABELS: Record<ProtocolRow['status'], string> = {
  waiting: 'Aguardando',
  ready: 'Pré-atendimento',
  in_attendance: 'Em atendimento',
};

const STATUS_COLORS: Record<ProtocolRow['status'], string> = {
  waiting: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
  ready: 'bg-blue-100 text-blue-800 border border-blue-200',
  in_attendance: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
};

export function RealtimeDashboard({ companyId }: RealtimeDashboardProps) {
  const [hourlyData, setHourlyData] = useState<HourlyPoint[]>([]);
  const [queueStatus, setQueueStatus] = useState<{
    totals: { waiting: number; ready: number; inAttendance: number };
    metrics: { averageWaitMinutes: number };
    protocols: ProtocolRow[];
  } | null>(null);
  const [waitStats, setWaitStats] = useState<
    | {
        confirmation: { count: number; avg: number; median: number; p90: number; p95: number; max: number };
        consultation: { count: number; avg: number; median: number; p90: number; p95: number; max: number };
        service: { count: number; avg: number; median: number; p90: number; p95: number; max: number };
      }
    | null
  >(null);
  const [topDoctors, setTopDoctors] = useState<Array<{ doctor_name: string; appointments: number }>>([]);
  const [topSpecialties, setTopSpecialties] = useState<Array<{ name: string; count: number }>>([]);
  const [topCid10, setTopCid10] = useState<Array<{ cid10: string; count: number }>>([]);
  const [companiesLeaderboard, setCompaniesLeaderboard] = useState<
    | {
        topByVolume: Array<{ company_id: number; company_name: string; total_appointments: number }>;
        topByWait: Array<{ company_id: number; company_name: string; avg_wait_minutes: number; total_protocols: number }>;
      }
    | null
  >(null);
  const [recentEvents, setRecentEvents] = useState<
    Array<{
      id: number;
      protocol?: string;
      appointmentId?: string;
      name?: string;
      event: string;
      nextGroup?: string;
      timestamp: string;
    }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const socketRef = useRef<Socket | null>(null);
  const isMountedRef = useRef(true);

  const wsBaseUrl = useMemo(() => {
    if (!API_BASE_URL) return '';
    if (API_BASE_URL.startsWith('https')) {
      return API_BASE_URL.replace('https', 'wss');
    }
    return API_BASE_URL.replace('http', 'ws');
  }, []);

  const loadRealtimeData = async () => {
    try {
      setError('');
      const [hourly, queue, events, wstats, doctors, specialties, cids, companies] = await Promise.all([
        dashboardAPI.getRealtimeHourlyAttendance(companyId),
        dashboardAPI.getRealtimeQueueStatus(companyId),
        dashboardAPI.getRealtimeRecentEvents(companyId),
        dashboardAPI.getRealtimeWaitTimeStats(companyId),
        dashboardAPI.getRealtimeTopDoctors(companyId),
        dashboardAPI.getRealtimeTopSpecialties(companyId),
        dashboardAPI.getRealtimeTopCid10(companyId),
        dashboardAPI.getRealtimeCompaniesLeaderboard(),
      ]);
      if (!isMountedRef.current) {
        return;
      }
      setHourlyData(hourly);
      setQueueStatus(queue);
      setRecentEvents(events);
      setWaitStats(wstats);
      setTopDoctors(doctors);
      setTopSpecialties(specialties);
      setTopCid10(cids);
      setCompaniesLeaderboard(companies);
    } catch (err) {
      console.error('Erro ao carregar dados em tempo real', err);
      if (isMountedRef.current) {
        setError('Não foi possível carregar os dados em tempo real.');
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    loadRealtimeData().catch(() => undefined);
    const interval = setInterval(() => {
      loadRealtimeData().catch(() => undefined);
    }, 15000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  useEffect(() => {
    if (!wsBaseUrl) {
      return;
    }

    const socket = io(`${wsBaseUrl}/realtime`, {
      transports: ['websocket'],
    });

    socketRef.current = socket;

    socket.on('protocol_event', (event) => {
      if (!isMountedRef.current) {
        return;
      }

      if (event?.companyId && event.companyId !== companyId) {
        return;
      }

      setRecentEvents((prev) => {
        const next = [event, ...prev];
        return next.slice(0, 25);
      });

      // Atualiza status da fila quando chegar novo evento
      loadRealtimeData().catch(() => undefined);
    });

    return () => {
      socket.off('protocol_event');
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, wsBaseUrl]);

  const chartData = useMemo(() => {
    if (!hourlyData.length) return [];
    return hourlyData.map((point) => ({
      hour: format(new Date(point.hour), 'HH:mm'),
      total: point.total,
    }));
  }, [hourlyData]);

  const slaFromPercentiles = (p: { median: number; p90: number; p95: number }, threshold: number) => {
    if (!p) return 0;
    if (p.p95 <= threshold) return 95;
    if (p.p90 <= threshold) return 90;
    if (p.median <= threshold) return 50;
    return 0;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        <span className="ml-2 text-sm text-gray-500">Carregando dados em tempo real...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
        {error}
      </div>
    );
  }

  if (!queueStatus) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded-md text-sm">
        Nenhum dado em tempo real disponível para este momento.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Em fila</p>
              <p className="text-2xl font-semibold text-gray-900">
                {queueStatus.totals.waiting.toLocaleString()}
              </p>
            </div>
            <Users className="h-6 w-6 text-blue-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Pré-atendimento</p>
              <p className="text-2xl font-semibold text-gray-900">
                {queueStatus.totals.ready.toLocaleString()}
              </p>
            </div>
            <Activity className="h-6 w-6 text-indigo-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Em atendimento</p>
              <p className="text-2xl font-semibold text-gray-900">
                {queueStatus.totals.inAttendance.toLocaleString()}
              </p>
            </div>
            <Zap className="h-6 w-6 text-emerald-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Tempo médio de espera</p>
              <p className="text-2xl font-semibold text-gray-900">
                {queueStatus.metrics.averageWaitMinutes.toLocaleString(undefined, {
                  maximumFractionDigits: 1,
                  minimumFractionDigits: 1,
                })}{' '}
                min
              </p>
            </div>
            <Clock className="h-6 w-6 text-orange-500" />
          </div>
        </div>
      </div>

      {waitStats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg border p-4">
            <p className="text-sm text-gray-500">Mediana espera (chegada → ready)</p>
            <p className="text-2xl font-semibold text-gray-900">{waitStats.confirmation.median.toFixed(1)} min</p>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <p className="text-sm text-gray-500">P90 espera (chegada → ready)</p>
            <p className="text-2xl font-semibold text-gray-900">{waitStats.confirmation.p90.toFixed(1)} min</p>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <p className="text-sm text-gray-500">P95 espera (chegada → ready)</p>
            <p className="text-2xl font-semibold text-gray-900">{waitStats.confirmation.p95.toFixed(1)} min</p>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <p className="text-sm text-gray-500">SLA 30 min (≈p90/p95)</p>
            <p className="text-2xl font-semibold text-gray-900">
              {slaFromPercentiles(waitStats.confirmation, 30)}%
            </p>
          </div>
        </div>
      )}

      <ChartCard title="Atendimentos por hora">
        {chartData.length ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData}>
              <defs>
                <linearGradient id="barGradientRealtimeHourly" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563eb" stopOpacity={0.65} />
                  <stop offset="100%" stopColor="#2563eb" stopOpacity={0.25} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="hour" />
              <YAxis allowDecimals={false} />
              <Tooltip
                formatter={(value: number) => [`${value} atend.`, 'Atendimentos']}
                labelFormatter={(label) => `Hora: ${label}`}
              />
              <Bar dataKey="total" fill="url(#barGradientRealtimeHourly)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-sm text-gray-500">Nenhum atendimento registrado nas últimas horas.</div>
        )}
      </ChartCard>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ChartCard title="Fila em tempo real">
          <div className="flex items-center justify-between mb-4">
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
              Empresa ID: {companyId}
            </span>
            <span className="text-sm text-gray-500">
              Atualizado {formatDistanceToNow(new Date(), { locale: ptBR })} atrás
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Protocolo
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Paciente
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Empresa
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Grupo
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Última atualização
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {queueStatus.protocols.map((protocol) => (
                  <tr key={`${protocol.protocol}-${protocol.lastUpdate}`}>
                    <td className="px-4 py-2 text-sm text-gray-700">
                      {protocol.protocol || protocol.appointmentId || '—'}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-700">
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {protocol.name || 'Paciente'}
                          {protocol.companyName ? ` - ${protocol.companyName}` : ''}
                        </span>
                        {protocol.cpf && (
                          <span className="text-xs text-gray-400">
                            CPF: {protocol.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-700">
                      {protocol.companyName || (protocol.companyId ? (COMPANY_MAP[protocol.companyId] || `ID ${protocol.companyId}`) : '—')}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-700">
                      {protocol.nextGroup || '—'}
                    </td>
                    <td className="px-4 py-2 text-sm">
                      <span
                        className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[protocol.status]}`}
                      >
                        {STATUS_LABELS[protocol.status]}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-700">
                      <div className="flex flex-col">
                        <span>
                          {format(new Date(protocol.lastUpdate), 'dd/MM HH:mm', { locale: ptBR })}
                        </span>
                        <span className="text-xs text-gray-400">
                          há{' '}
                          {formatDistanceToNow(new Date(protocol.lastUpdate), {
                            locale: ptBR,
                          })}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>

        <ChartCard title="Eventos recentes">
          <div className="flex items-center justify-end mb-4">
            <span className="text-sm text-gray-500">Últimos {recentEvents.length} eventos</span>
          </div>

          <div className="space-y-4 max-h-[420px] overflow-y-auto pr-2">
            {recentEvents.map((event) => (
              <div key={event.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{event.event}</p>
                    <p className="text-sm text-gray-600">
                      {event.name || 'Paciente'}{' '}
                      {event.nextGroup ? `• ${event.nextGroup}` : ''}
                    </p>
                  </div>
                  <span className="text-xs text-gray-400">
                    {format(new Date(event.timestamp), 'dd/MM HH:mm', { locale: ptBR })}
                  </span>
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  Protocolo: {event.protocol || '—'}{' '}
                  {event.appointmentId ? `• Consulta ${event.appointmentId}` : ''}
                </div>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ChartCard title="Ranking de médicos (hoje)">
          {topDoctors.length ? (
            <div className="space-y-2">
              {topDoctors.map((d) => (
                <div key={d.doctor_name} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">{d.doctor_name}</span>
                  <span className="text-gray-900 font-medium">{d.appointments}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-500">Sem dados nas últimas horas.</div>
          )}
        </ChartCard>

        <ChartCard title="Top especialidades (hoje)">
          {topSpecialties.length ? (
            <div className="space-y-2">
              {topSpecialties.map((s) => (
                <div key={s.name} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">{s.name}</span>
                  <span className="text-gray-900 font-medium">{s.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-500">Sem dados nas últimas horas.</div>
          )}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ChartCard title="Top CID10 (hoje)">
          {topCid10.length ? (
            <div className="space-y-2">
              {topCid10.map((c) => (
                <div key={c.cid10} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">{c.cid10}</span>
                  <span className="text-gray-900 font-medium">{c.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-500">Sem dados nas últimas horas.</div>
          )}
        </ChartCard>

        <ChartCard title="Empresas">
          {companiesLeaderboard ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-sm font-semibold text-gray-800 mb-2">Top por volume</h4>
                <div className="space-y-2">
                  {companiesLeaderboard.topByVolume.map((c) => (
                    <div key={`vol-${c.company_id}`} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700">{c.company_name}</span>
                      <span className="text-gray-900 font-medium">{c.total_appointments}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-gray-800 mb-2">Maior tempo de espera</h4>
                <div className="space-y-2">
                  {companiesLeaderboard.topByWait.map((c) => (
                    <div key={`wait-${c.company_id}`} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700">{c.company_name}</span>
                      <span className="text-gray-900 font-medium">{c.avg_wait_minutes.toFixed(1)} min</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-500">Sem dados nas últimas horas.</div>
          )}
        </ChartCard>
      </div>
    </div>
  );
}
