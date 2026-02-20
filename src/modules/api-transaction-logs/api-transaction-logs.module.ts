import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiTransactionLog } from './entities/api-transaction-log.entity';
import { ApiTransactionLogsService } from './api-transaction-logs.service';
import { ApiTransactionLogsController } from './api-transaction-logs.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ApiTransactionLog])],
  controllers: [ApiTransactionLogsController],
  providers: [ApiTransactionLogsService],
  exports: [ApiTransactionLogsService],
})
export class ApiTransactionLogsModule {}
