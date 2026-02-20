import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);
  private readonly axiosInstance: AxiosInstance;

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: process.env.KYC_API_URL || 'https://api.kyc.com',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  async initiateKyc(phoneNumber: string, aadhaarNumber?: string) {
    this.logger.log(`Initiating KYC for phone: ${phoneNumber}`);
    const startTime = Date.now();

    try {
      // Mock response for demonstration - replace with actual API call
      // const response = await this.axiosInstance.post('/initiate', { phoneNumber, aadhaarNumber });
      
      // Simulated response
      const response = {
        success: true,
        data: {
          requestId: 'KY' + Date.now(),
          phoneNumber,
          status: 'INITIATED',
          otpSent: true,
        },
      };

      const durationMs = Date.now() - startTime;
      this.logger.log(`KYC initiated in ${durationMs}ms`);

      return response;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      this.logger.error(`KYC initiation failed after ${durationMs}ms: ${error.message}`);
      throw error;
    }
  }

  async verifyOtp(requestId: string, otp: string) {
    this.logger.log(`Verifying OTP for request: ${requestId}`);
    const startTime = Date.now();

    try {
      // Mock response for demonstration - replace with actual API call
      // const response = await this.axiosInstance.post('/verify-otp', { requestId, otp });
      
      // Simulated response
      const response = {
        success: true,
        data: {
          requestId,
          status: 'VERIFIED',
          kycLevel: 2,
        },
      };

      const durationMs = Date.now() - startTime;
      this.logger.log(`OTP verified in ${durationMs}ms`);

      return response;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      this.logger.error(`OTP verification failed after ${durationMs}ms: ${error.message}`);
      throw error;
    }
  }

  async getKycStatus(requestId: string) {
    this.logger.log(`Getting KYC status for request: ${requestId}`);
    const startTime = Date.now();

    try {
      // Mock response for demonstration - replace with actual API call
      // const response = await this.axiosInstance.get(`/status/${requestId}`);
      
      // Simulated response
      const response = {
        success: true,
        data: {
          requestId,
          status: 'VERIFIED',
          kycLevel: 2,
          verifiedAt: new Date().toISOString(),
        },
      };

      const durationMs = Date.now() - startTime;
      this.logger.log(`KYC status retrieved in ${durationMs}ms`);

      return response;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      this.logger.error(`KYC status retrieval failed after ${durationMs}ms: ${error.message}`);
      throw error;
    }
  }
}
