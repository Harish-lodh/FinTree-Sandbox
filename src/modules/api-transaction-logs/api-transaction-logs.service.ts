import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiTransactionLog } from './entities/api-transaction-log.entity';
import { CreateApiTransactionLogDto } from './dto/create-api-transaction-log.dto';

@Injectable()
export class ApiTransactionLogsService {
  private readonly logger = new Logger(ApiTransactionLogsService.name);

  constructor(
    @InjectRepository(ApiTransactionLog)
    private readonly apiTransactionLogRepository: Repository<ApiTransactionLog>,
  ) {}

  async logTransaction(createDto: CreateApiTransactionLogDto): Promise<ApiTransactionLog> {
    try {
      const transactionLog = this.apiTransactionLogRepository.create(createDto);
      const savedLog = await this.apiTransactionLogRepository.save(transactionLog);
      this.logger.debug(`Transaction logged: ${savedLog.id}`);
      return savedLog;
    } catch (error) {
      this.logger.error(`Failed to log transaction: ${error.message}`);
      throw error;
    }
  }

  async findAll(): Promise<ApiTransactionLog[]> {
    return this.apiTransactionLogRepository.find({
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async findByCallerId(callerId: string): Promise<ApiTransactionLog[]> {
    return this.apiTransactionLogRepository.find({
      where: { callerId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async findByService(service: string): Promise<ApiTransactionLog[]> {
    return this.apiTransactionLogRepository.find({
      where: { service },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async findByStatus(status: 'success' | 'error' | 'pending'): Promise<ApiTransactionLog[]> {
    return this.apiTransactionLogRepository.find({
      where: { status },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async findOne(id: number): Promise<ApiTransactionLog | null> {
    return this.apiTransactionLogRepository.findOne({ where: { id } });
  }
}
