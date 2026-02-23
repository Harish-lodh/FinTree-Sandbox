import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class GstService {
  private readonly logger = new Logger(GstService.name);

  private readonly zoopUrl: string;
  private readonly zoopKey: string;
  private readonly zoopAppId: string;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {
    this.zoopUrl = this.config.get('ZOOP_GST_API_URL') ?? '';
    this.zoopKey = this.config.get('ZOOP_API_KEY') ?? '';
    this.zoopAppId = this.config.get('ZOOP_APP_ID') ?? '';
  }

  async getGstDetails(gstNumber: string) {
    try {
      const payload = {
        mode: 'sync',
        data: {
          business_gstin_number: gstNumber.toUpperCase(),
          contact_info: true,
          financial_year: '2024-25',
          consent: 'Y',
          consent_text:
            'I hereby declare my consent agreement for fetching my information via ZOOP API.',
        },
        task_id: uuidv4(),
      };

      const { data } = await firstValueFrom(
        this.http.post(this.zoopUrl, payload, {
          headers: {
            'Content-Type': 'application/json',
            'api-key': this.zoopKey,
            'app-id': this.zoopAppId,
          },
        }),
      );

      return data;
    } catch (err) {
      this.logger.error('GST verification failed', err);
      throw new Error('GST verification failed');
    }
  }
}
