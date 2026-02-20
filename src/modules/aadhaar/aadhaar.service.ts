import { Injectable, Logger, HttpException, HttpStatus, BadRequestException } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { ConfigService } from '@nestjs/config';

export interface AadhaarKycLinkResult {
  transactionId: string;
  url?: string;
  kycUrl?: string;
  raw: any;
}

export interface AadhaarKycDetailsResult {
  success: boolean;
  transactionId: string;
  raw: any;
}

@Injectable()
export class AadhaarService {
  private readonly logger = new Logger(AadhaarService.name);
  private readonly axios: AxiosInstance;

  private accessToken: string | null = null;
  private tokenExpiry = 0;

  constructor(private readonly config: ConfigService) {
    this.axios = axios.create({
      baseURL: this.config.get('DIGITAP_BASE_URL', 'https://api.digitap.ai'),
      timeout: 60000,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // -------------------- AUTH --------------------
  private async getToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      const res = await this.axios.post('/auth/token', {
        client_id: this.config.get('DIGITAP_CLIENT_ID'),
        client_secret: this.config.get('DIGITAP_CLIENT_SECRET'),
        grant_type: 'client_credentials',
      });

      this.accessToken = res.data.access_token;
      const expiresIn = Math.max(res.data.expires_in - 300, 60);
      this.tokenExpiry = Date.now() + expiresIn * 1000;

      return this.accessToken;
    } catch (err) {
      this.handleError(err, 'Digitap authentication failed');
    }
  }

  private async authHeaders() {
    return {
      Authorization: `Bearer ${await this.getToken()}`,
    };
  }

  // -------------------- OTP --------------------
  async generateAadhaarOtp(aadhaarNumber: string) {
    try {
      const res = await this.axios.post(
        '/aadhaar/v1/generate-otp',
        {
          aadhaar_number: aadhaarNumber,
          redirect_url: this.config.get('AADHAAR_REDIRECT_URL'),
        },
        { headers: await this.authHeaders() },
      );

      return {
        requestId: res.data.request_id || res.data.ref_id,
        status: res.data.status || 'OTP_SENT',
        message: res.data.message || 'OTP sent successfully',
      };
    } catch (err) {
      this.handleError(err, 'Failed to generate OTP');
    }
  }

  async verifyAadhaarOtp(requestId: string, otp: string) {
    try {
      const res = await this.axios.post(
        '/aadhaar/v1/verify-otp',
        { request_id: requestId, otp },
        { headers: await this.authHeaders() },
      );

      return {
        requestId,
        status: res.data.status || 'VERIFIED',
        name: res.data.name,
        dob: res.data.dob,
        gender: res.data.gender,
        address: res.data.address,
        maskedAadhaarNumber: res.data.masked_aadhaar_number,
        verified: true,
      };
    } catch (err) {
      this.handleError(err, 'Failed to verify OTP');
    }
  }

  // -------------------- DETAILS --------------------
  async getAadhaarDetails(requestId: string) {
    try {
      const res = await this.axios.get(
        `/aadhaar/v1/details/${requestId}`,
        { headers: await this.authHeaders() },
      );

      return {
        requestId,
        name: res.data.name,
        dob: res.data.dob,
        gender: res.data.gender,
        address: res.data.address,
        state: res.data.state,
        district: res.data.district,
        verified: true,
      };
    } catch (err) {
      this.handleError(err, 'Failed to fetch Aadhaar details');
    }
  }

  // -------------------- OFFLINE --------------------
  async verifyOfflineAadhaar(xmlData: string) {
    try {
      const res = await this.axios.post(
        '/aadhaar/v1/offline-verify',
        { xml_data: xmlData },
        { headers: await this.authHeaders() },
      );

      return {
        status: res.data.status,
        name: res.data.name,
        dob: res.data.dob,
        gender: res.data.gender,
        address: res.data.address,
        maskedAadhaarNumber: res.data.masked_aadhaar,
        verified: true,
      };
    } catch (err) {
      this.handleError(err, 'Offline Aadhaar verification failed');
    }
  }

  // -------------------- KYC LINK GENERATION (DIGITAP) --------------------
  /**
   * Build headers using Base64 encoded client_id:client_secret
   * As per Digitap docs: Authorization = Base64(client_id:client_secret)
   */
  private buildDigitapHeaders() {
    const clientId = this.config.get<string>('DIGITAP_CLIENT_ID');
    const clientSecret = this.config.get<string>('DIGITAP_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      throw new BadRequestException(
        'Digitap CLIENT_ID or CLIENT_SECRET missing in .env',
      );
    }

    const token = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    return {
      Authorization: token,
      'Content-Type': 'application/json',
      accept: '*/*',
    };
  }

  /**
   * 1️⃣ Generate KYC Link - Sends link to customer's mobile number
   * POST {baseUrl}/ent/v1/kyc/generate-url
   */
  async generateKycLink(params: {
    firstName: string;
    lastName: string;
    uid: string;
    mobile: string;
    emailId?: string;
    redirectionUrl: string;
  }): Promise<AadhaarKycLinkResult> {
    const baseUrl = this.config.get<string>('DIGITAP_BASE_URL');
    if (!baseUrl) {
      throw new BadRequestException('DIGITAP_BASE_URL is missing in .env');
    }

    const url = `${baseUrl}/ent/v1/kyc/generate-url`;

    const payload = {
      serviceId: '4',
      uid: params.uid,
      firstName: params.firstName,
      lastName: params.lastName,
      mobile: params.mobile,
      emailId: params.emailId,
      isSendOtp: true, // ✅ DIGITAP HANDLES SMS - sends link to mobile
      isHideExplanationScreen: false,
      redirectionUrl: params.redirectionUrl,
    };


    try {
      const res = await this.axios.post(url, payload, {
        headers: this.buildDigitapHeaders(),
      });


      return {
        transactionId: res.data.model?.transactionId,
        url: res.data.model?.url,
        kycUrl: res.data.model?.kycUrl,
        raw: res.data,
      };
    } catch (err) {
      this.handleError(err, 'Failed to generate KYC link');
    }
  }

  /**
   * 2️⃣ Get KYC Details - Fetch DigiLocker details after user completes KYC
   * POST {baseUrl}/ent/v1/kyc/get-digilocker-details
   */
  async fetchKycDetails(transactionId: string): Promise<AadhaarKycDetailsResult> {
    const baseUrl = this.config.get<string>('DIGITAP_BASE_URL');
    if (!baseUrl) {
      throw new BadRequestException('DIGITAP_BASE_URL is missing in .env');
    }

    if (!transactionId) {
      throw new BadRequestException('transactionId is required');
    }

    const url = `${baseUrl}/ent/v1/kyc/get-digilocker-details`;
    const payload = { transactionId };

    this.logger.debug(`Digitap get-digilocker-details txn=${transactionId}`);

    try {
      const res = await this.axios.post(url, payload, {
        headers: this.buildDigitapHeaders(),
        validateStatus: () => true,
      });

      this.logger.debug(`Digitap details raw: ${JSON.stringify(res.data)}`);

      // Success detection
      const success =
        res.data?.code === '200' ||
        res.data?.success === true ||
        res.data?.status === 'SUCCESS' ||
        res.data?.status === 'success';

      return {
        success,
        transactionId,
        raw: res.data,
      };
    } catch (err) {
      this.handleError(err, 'Failed to fetch KYC details');
    }
  }

  // -------------------- ERROR HANDLER --------------------
  private handleError(error: any, message: string): never {
    const status =
      error?.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;

    const msg =
      error?.response?.data?.message || error?.message || message;

    this.logger.error(msg);

    throw new HttpException(msg, status);
  }
}