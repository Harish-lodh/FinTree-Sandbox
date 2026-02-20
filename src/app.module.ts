import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR, APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ApiTransactionLog } from './modules/api-transaction-logs/entities/api-transaction-log.entity';
import { ApiTransactionLogsModule } from './modules/api-transaction-logs/api-transaction-logs.module';
import { PanVerificationModule } from './modules/pan-verification/pan-verification.module';
import { KycModule } from './modules/kyc/kyc.module';
import { AadhaarModule } from './modules/aadhaar/aadhaar.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { EsignModule } from './modules/esign/esign.module';
import { HealthModule } from './modules/health/health.module';
import { ApiKeyGuard } from './common/guards/api-key.guard';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';


@Module({
  imports: [
    // Config Module
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // TypeORM configuration - using forRootAsync to ensure env vars are loaded at runtime
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'mysql',
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '3306', 10),
        username: process.env.DB_USERNAME || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'integration_hub',
        entities: [ApiTransactionLog],
        synchronize: true, // Set to false in production
        logging: process.env.NODE_ENV === 'development',
      }),
    }),

    // Feature Modules

    ApiTransactionLogsModule,
    PanVerificationModule,
    KycModule,
    AadhaarModule,
    PaymentsModule,
    EsignModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Global API Key Guard - applies to all routes
    {
      provide: APP_GUARD,
      useClass: ApiKeyGuard,
    },
    // Global Response Interceptor
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
  ],

  exports: [AppService],
})
export class AppModule {}
