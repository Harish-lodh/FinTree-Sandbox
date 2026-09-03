import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { ApiTransactionLogsModule } from '../api-transaction-logs/api-transaction-logs.module';
import { AmlController } from './aml.controller';
import { AmlService } from './aml.service';

@Module({
  imports: [HttpModule, ConfigModule, ApiTransactionLogsModule],
  controllers: [AmlController],
  providers: [AmlService],
  exports: [AmlService],
})
export class AmlModule {}
