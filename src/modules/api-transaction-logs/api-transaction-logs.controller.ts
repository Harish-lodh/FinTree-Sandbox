import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity, ApiQuery } from '@nestjs/swagger';
import { ApiTransactionLogsService } from './api-transaction-logs.service';
import { CreateApiTransactionLogDto } from './dto/create-api-transaction-log.dto';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';


@ApiTags('API Transaction Logs')
@ApiSecurity('X-API-Key')
@Controller('api-transaction-logs')
export class ApiTransactionLogsController {

  constructor(private readonly apiTransactionLogsService: ApiTransactionLogsService) {}

  @Post()
  @UseGuards(ApiKeyGuard)
  @ApiOperation({ summary: 'Log a new API transaction' })

  @ApiResponse({ status: 201, description: 'Transaction logged successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async create(@Body() createDto: CreateApiTransactionLogDto) {
    const result = await this.apiTransactionLogsService.logTransaction(createDto);
    return {
      success: true,
      message: 'Transaction logged successfully',
      data: result,
    };
  }

  @Get()
  @UseGuards(ApiKeyGuard)
  @ApiOperation({ summary: 'Get all API transactions' })

  @ApiResponse({ status: 200, description: 'List of transactions' })
  @ApiQuery({ name: 'callerId', required: false })
  @ApiQuery({ name: 'service', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['success', 'error', 'pending'] })
  async findAll(
    @Query('callerId') callerId?: string,
    @Query('service') service?: string,
    @Query('status') status?: 'success' | 'error' | 'pending',
  ) {
    let result;

    if (callerId) {
      result = await this.apiTransactionLogsService.findByCallerId(callerId);
    } else if (service) {
      result = await this.apiTransactionLogsService.findByService(service);
    } else if (status) {
      result = await this.apiTransactionLogsService.findByStatus(status);
    } else {
      result = await this.apiTransactionLogsService.findAll();
    }

    return {
      success: true,
      message: 'Transactions retrieved successfully',
      data: result,
    };
  }

  @Get(':id')
  @UseGuards(ApiKeyGuard)
  @ApiOperation({ summary: 'Get a transaction by ID' })

  @ApiResponse({ status: 200, description: 'Transaction found' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async findOne(@Param('id') id: string) {
    const result = await this.apiTransactionLogsService.findOne(parseInt(id, 10));
    if (!result) {
      return {
        success: false,
        message: 'Transaction not found',
        data: null,
      };
    }
    return {
      success: true,
      message: 'Transaction found',
      data: result,
    };
  }
}
