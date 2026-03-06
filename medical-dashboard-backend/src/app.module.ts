import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DashboardController, ReportController, AuthController } from './controllers';
import { DashboardService, ReportService, CronService, AuthService } from './services';
import { JwtStrategy } from './auth/jwt.strategy';
import { LocalStrategy } from './auth/local.strategy';
import { RealtimeModule } from './realtime/realtime.module';
import { MetricsModule } from './dashboard/metrics/metrics.module';
import { 
  Company, 
  Appointment, 
  User, 
  File, 
  AppointmentDetail, 
  AppointmentParticipant,
  Protocol,
  ProtocolHistory,
  UserSession,
  ProtocolEvent
  ,DashboardData
} from './entities';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key',
      signOptions: { expiresIn: '24h' },
    }),
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      username: process.env.DB_USER || 'root',
      password: process.env.DB_PASS || 'password',
      database: process.env.DB_NAME || 'appdb',
      entities: [
        Company,
        Appointment,
        User,
        File,
        AppointmentDetail,
      AppointmentParticipant,
      Protocol,
      ProtocolHistory,
      UserSession,
      ProtocolEvent
      ,DashboardData
    ],
      synchronize: false,
      logging: false,
      // keepConnectionAlive removido: opção não suportada nesta versão do @nestjs/typeorm
      // Tenta reconectar em caso de queda de conexão
      retryAttempts: 5,
      retryDelay: 3000,
      // Opções adicionais do driver mysql2 (pool e keep-alive)
      extra: {
        connectionLimit: 10,
        waitForConnections: true,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 30000,
        // Ajusta tempo de conexão e parâmetros de idle do pool
        connectTimeout: 10000,
        maxIdle: 10,
        idleTimeout: 60000,
      },
    }),
    TypeOrmModule.forFeature([
      Company,
      Appointment,
      User,
      File,
      AppointmentDetail,
      AppointmentParticipant,
      Protocol,
      ProtocolHistory,
      UserSession,
      ProtocolEvent
      ,DashboardData
    ]),
    RealtimeModule,
    MetricsModule,
  ],
  controllers: [AppController, DashboardController, ReportController, AuthController],
  providers: [AppService, DashboardService, ReportService, CronService, AuthService, JwtStrategy, LocalStrategy],
})
export class AppModule {}
