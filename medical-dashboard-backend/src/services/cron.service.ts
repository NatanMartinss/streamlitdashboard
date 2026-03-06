import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Appointment, Company } from '../entities';
import { DashboardService } from './dashboard.service';
import { spawn } from 'child_process';
import * as path from 'path';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(
    @InjectRepository(Appointment)
    private appointmentRepository: Repository<Appointment>,
    @InjectRepository(Company)
    private companyRepository: Repository<Company>,
    private readonly dashboardService: DashboardService,
  ) {}

  // Executa todos os dias às 2:00 AM
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async handleDailyDataCleanup() {
    this.logger.log('Iniciando limpeza diária de dados...');
    
    try {
      // Exemplo: Limpar dados antigos (mais de 2 anos)
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

      const result = await this.appointmentRepository
        .createQueryBuilder()
        .delete()
        .from(Appointment)
        .where('executed_date_time < :date', { date: twoYearsAgo })
        .execute();

      this.logger.log(`Limpeza concluída. ${result.affected} registros removidos.`);
    } catch (error) {
      this.logger.error('Erro durante a limpeza diária:', error);
    }
  }

  // Executa toda segunda-feira às 8:00 AM
  @Cron(CronExpression.MONDAY_TO_FRIDAY_AT_8AM)
  async handleWeeklyReport() {
    this.logger.log('Gerando relatório semanal...');
    
    try {
      // Exemplo: Gerar estatísticas semanais
      const lastWeek = new Date();
      lastWeek.setDate(lastWeek.getDate() - 7);

      const companies = await this.companyRepository.find({
        where: { is_active: true }
      });

      for (const company of companies) {
        const appointmentCount = await this.appointmentRepository
          .createQueryBuilder('appointment')
          .where('appointment.company_id = :companyId', { companyId: company.id })
          .andWhere('appointment.executed_date_time >= :lastWeek', { lastWeek })
          .getCount();

        this.logger.log(`Empresa ${company.name}: ${appointmentCount} consultas na última semana`);
      }
    } catch (error) {
      this.logger.error('Erro durante geração do relatório semanal:', error);
    }
  }

  // Executa no primeiro dia de cada mês às 9:00 AM
  @Cron('0 9 1 * *')
  async handleMonthlyMaintenance() {
    this.logger.log('Executando manutenção mensal...');
    
    try {
      // Exemplo: Otimizar tabelas, gerar relatórios mensais, etc.
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);

      // Aqui você pode adicionar tarefas de manutenção específicas
      this.logger.log('Manutenção mensal concluída.');
    } catch (error) {
      this.logger.error('Erro durante manutenção mensal:', error);
    }
  }

  // Executa a cada 6 horas
  @Cron(CronExpression.EVERY_6_HOURS)
  async handleDataSync() {
    this.logger.log('Sincronizando dados...');
    
    try {
      // Exemplo: Sincronizar dados com sistemas externos
      // Verificar integridade dos dados
      // Atualizar caches, etc.
      
      this.logger.log('Sincronização de dados concluída.');
    } catch (error) {
      this.logger.error('Erro durante sincronização:', error);
    }
  }

  // Executa todo dia à meia-noite: ingere dados via Python e agrega métricas
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleNightlyIngestionAndAggregation() {
    this.logger.log('Iniciando cron noturno: ingestão Python e agregação de métricas...');

    // Utilitário para formatar data YYYY-MM-DD
    const formatDate = (d: Date) => {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };

    // Janela: ontem
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const fromDate = formatDate(yesterday);
    const toDate = formatDate(yesterday);

    // Caminho do script Python (cron_v2.py) na raiz do projeto
    const scriptPath = path.resolve(process.cwd(), '..', 'cron_v2.py');

    // Tenta executar com 'python'; se falhar, tenta 'py'
    const runPython = (pythonCmd: string) =>
      new Promise<void>((resolve) => {
        const child = spawn(pythonCmd, [scriptPath, '--from', fromDate, '--to', toDate], {
          cwd: path.resolve(process.cwd(), '..'),
          shell: false,
        });

        child.stdout.on('data', (data) => this.logger.log(`[${pythonCmd}] ${data.toString().trim()}`));
        child.stderr.on('data', (data) => this.logger.warn(`[${pythonCmd}][stderr] ${data.toString().trim()}`));
        child.on('error', (err) => {
          this.logger.error(`Falha ao executar ${pythonCmd} ${scriptPath}: ${err.message}`);
          resolve();
        });
        child.on('close', (code) => {
          if (code === 0) {
            this.logger.log(`Ingestão Python concluída com sucesso (${pythonCmd}).`);
          } else {
            this.logger.warn(`Ingestão Python finalizou com código ${code} (${pythonCmd}).`);
          }
          resolve();
        });
      });

    try {
      // Executa cron_v2.py; não bloqueia agregação se falhar
      await runPython('python');
      await runPython('py');
    } catch (err) {
      this.logger.error(`Erro inesperado ao executar script Python: ${err instanceof Error ? err.message : String(err)}`);
    }

    try {
      // Agrega e cacheia métricas para o mês atual de todas as empresas ativas
      const companies = await this.companyRepository.find({ where: { is_active: true } });
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      const startStr = formatDate(monthStart);
      const endStr = formatDate(monthEnd);

      for (const company of companies) {
        try {
          await this.dashboardService.getWaitTimesFromAppointments(company.id, startStr, endStr, true);
          this.logger.log(`Cache de métricas atualizado para empresa ${company.id} (${company.name}) período ${startStr} a ${endStr}`);
        } catch (err) {
          this.logger.error(`Erro ao agregar métricas para empresa ${company.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      this.logger.log('Cron noturno concluído: agregação e cache finalizados.');
    } catch (error) {
      this.logger.error('Erro durante agregação/caching noturno:', error);
    }
  }
}