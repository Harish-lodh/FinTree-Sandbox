import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity } from '@nestjs/swagger';

import { PaymentsService } from './payments.service';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';


class InitiatePaymentDto {
  amount: number;
  currency?: string;
  customerId?: string;
}

class RefundPaymentDto {
  paymentId: string;
  amount?: number;
}

@ApiTags('Payments')
@ApiSecurity('X-API-Key')
@Controller('payments')
export class PaymentsController {

  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('initiate')
  @UseGuards(ApiKeyGuard)
  @ApiOperation({ summary: 'Initiate a payment' })

  @ApiResponse({ status: 200, description: 'Payment initiated successfully' })
  async initiatePayment(@Body() dto: InitiatePaymentDto) {
    const result = await this.paymentsService.initiatePayment(dto.amount, dto.currency, dto.customerId);
    return {
      success: true,
      message: 'Payment initiated successfully',
      data: result.data,
    };
  }

  @Post('verify/:paymentId')
  @UseGuards(ApiKeyGuard)
  @ApiOperation({ summary: 'Verify a payment' })

  @ApiResponse({ status: 200, description: 'Payment verified successfully' })
  async verifyPayment(@Param('paymentId') paymentId: string) {
    const result = await this.paymentsService.verifyPayment(paymentId);
    return {
      success: true,
      message: 'Payment verified successfully',
      data: result.data,
    };
  }

  @Get('status/:paymentId')
  @UseGuards(ApiKeyGuard)
  @ApiOperation({ summary: 'Get payment status' })

  @ApiResponse({ status: 200, description: 'Payment status retrieved' })
  async getPaymentStatus(@Param('paymentId') paymentId: string) {
    const result = await this.paymentsService.getPaymentStatus(paymentId);
    return {
      success: true,
      message: 'Payment status retrieved',
      data: result.data,
    };
  }

  @Post('refund')
  @UseGuards(ApiKeyGuard)
  @ApiOperation({ summary: 'Initiate a refund' })

  @ApiResponse({ status: 200, description: 'Refund initiated successfully' })
  async refundPayment(@Body() dto: RefundPaymentDto) {
    const result = await this.paymentsService.refundPayment(dto.paymentId, dto.amount);
    return {
      success: true,
      message: 'Refund initiated successfully',
      data: result.data,
    };
  }
}
