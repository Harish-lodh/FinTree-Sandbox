import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly axiosInstance: AxiosInstance;

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: process.env.PAYMENTS_API_URL || 'https://api.payments.com',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  async initiatePayment(amount: number, currency: string = 'INR', customerId?: string) {
    this.logger.log(`Initiating payment: ${amount} ${currency}`);
    const startTime = Date.now();

    try {
      // Mock response for demonstration - replace with actual API call
      // const response = await this.axiosInstance.post('/initiate', { amount, currency, customerId });
      
      // Simulated response
      const response = {
        success: true,
        data: {
          paymentId: 'PAY' + Date.now(),
          amount,
          currency,
          status: 'PENDING',
          customerId,
          createdAt: new Date().toISOString(),
        },
      };

      const durationMs = Date.now() - startTime;
      this.logger.log(`Payment initiated in ${durationMs}ms`);

      return response;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      this.logger.error(`Payment initiation failed after ${durationMs}ms: ${error.message}`);
      throw error;
    }
  }

  async verifyPayment(paymentId: string) {
    this.logger.log(`Verifying payment: ${paymentId}`);
    const startTime = Date.now();

    try {
      // Mock response for demonstration - replace with actual API call
      // const response = await this.axiosInstance.get(`/verify/${paymentId}`);
      
      // Simulated response
      const response = {
        success: true,
        data: {
          paymentId,
          status: 'SUCCESS',
          amount: 1000,
          currency: 'INR',
          verifiedAt: new Date().toISOString(),
        },
      };

      const durationMs = Date.now() - startTime;
      this.logger.log(`Payment verified in ${durationMs}ms`);

      return response;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      this.logger.error(`Payment verification failed after ${durationMs}ms: ${error.message}`);
      throw error;
    }
  }

  async getPaymentStatus(paymentId: string) {
    this.logger.log(`Getting payment status: ${paymentId}`);
    const startTime = Date.now();

    try {
      // Mock response for demonstration - replace with actual API call
      // const response = await this.axiosInstance.get(`/status/${paymentId}`);
      
      // Simulated response
      const response = {
        success: true,
        data: {
          paymentId,
          status: 'SUCCESS',
          amount: 1000,
          currency: 'INR',
          createdAt: new Date().toISOString(),
        },
      };

      const durationMs = Date.now() - startTime;
      this.logger.log(`Payment status retrieved in ${durationMs}ms`);

      return response;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      this.logger.error(`Payment status retrieval failed after ${durationMs}ms: ${error.message}`);
      throw error;
    }
  }

  async refundPayment(paymentId: string, amount?: number) {
    this.logger.log(`Initiating refund for payment: ${paymentId}`);
    const startTime = Date.now();

    try {
      // Mock response for demonstration - replace with actual API call
      // const response = await this.axiosInstance.post('/refund', { paymentId, amount });
      
      // Simulated response
      const response = {
        success: true,
        data: {
          refundId: 'REF' + Date.now(),
          paymentId,
          amount: amount || 1000,
          status: 'REFUND_INITIATED',
          createdAt: new Date().toISOString(),
        },
      };

      const durationMs = Date.now() - startTime;
      this.logger.log(`Refund initiated in ${durationMs}ms`);

      return response;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      this.logger.error(`Refund initiation failed after ${durationMs}ms: ${error.message}`);
      throw error;
    }
  }
}
