import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { InvitationModule } from './modules/invitations/invitation.module';
import { RolesModule } from './modules/roles/roles.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { SkillsModule } from './modules/skills/skills.module';
import { EmployeeSkillsModule } from './modules/employee-skills/employee-skills.module';
import { ClientsModule } from './modules/clients/clients.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { ProjectAllocationsModule } from './modules/project-allocations/project-allocations.module';
import { ProjectSkillsModule } from './modules/project-skills/project-skills.module';
import { TimesheetsModule } from './modules/timesheets/timesheets.module';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import authConfig from './config/auth.config';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/authorization.guard';
import { PermissionsGuard } from './common/guards/authorization.guard';
import { ActivityTrackingInterceptor } from './common/interceptors/activity-tracking.interceptor';
import { EmailService } from './email/email.service';
import { CronjobsService } from './shared/cronjobs.service';
import mailConfig from './config/mail.config';

@Module({
  imports: [
    // Configuration Module
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, authConfig, mailConfig],
      envFilePath: ['.env.local', '.env'],
    }),

    // Scheduler Module
    ScheduleModule.forRoot(),

    // TypeORM Module
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('database.host'),
        port: configService.get('database.port'),
        username: configService.get('database.username'),
        password: configService.get('database.password'),
        database: configService.get('database.database'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: false,
        // logging: configService.get('app.nodeEnv') === 'development',
        logging: false,
      }),
      inject: [ConfigService],
    }),

    // Feature Modules
    UsersModule,
    AuthModule,
    InvitationModule,
    RolesModule,
    PermissionsModule,
    EmployeesModule,
    SkillsModule,
    EmployeeSkillsModule,
    ClientsModule,
    ProjectsModule,
    ProjectAllocationsModule,
    ProjectSkillsModule,
    TimesheetsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    EmailService,
    CronjobsService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ActivityTrackingInterceptor,
    },
  ],
  exports: [EmailService],
})
export class AppModule {}
