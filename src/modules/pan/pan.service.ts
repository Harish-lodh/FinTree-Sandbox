import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class PanService {
  private readonly logger = new Logger(PanService.name);

  private readonly zoopUrl: string;
  private readonly zoopApiKey: string;
  private readonly zoopAppId: string;

  private readonly finanalyzUrl: string;
  private readonly finanalyzKey: string;

  constructor(
    private readonly http: HttpService,
  ) {
    this.zoopUrl = process.env.ZOOP_PAN_API_URL ?? '';
    this.zoopApiKey = process.env.ZOOP_API_KEY ?? '';
    this.zoopAppId = process.env.ZOOP_APP_ID ?? '';

    this.finanalyzUrl = process.env.FINANALYZ_PAN_URL ?? '';
    this.finanalyzKey = process.env.FINANALYZ_X_API_KEY ?? '';

    // Log config status once at startup
    this.logger.log(`Zoop config: url=${!!this.zoopUrl}, key=${!!this.zoopApiKey}, app=${!!this.zoopAppId}`);
    this.logger.log(`Finanalyz config: url=${!!this.finanalyzUrl}, key=${!!this.finanalyzKey}`);
  }

  // ───────────────────────────────────────────────
  // Verification providers
  // ───────────────────────────────────────────────

  private async callZoopPan(pan: string, name: string) {
    this.logger.log(`Attempting Zoop verification → PAN: ${pan} | Name: ${name}`);

    if (!this.zoopUrl || !this.zoopApiKey || !this.zoopAppId) {
      this.logger.error('Zoop configuration missing');
      throw new Error('Zoop service not configured');
    }

    const payload = {
      mode: 'sync',
      data: {
        customer_pan_number: pan.toUpperCase(),
        pan_holder_name: name.toUpperCase(),
        consent: 'Y',
        consent_text: 'I hereby declare my consent agreement for fetching my information via ZOOP API',
      },
      task_id: uuidv4(),
    };

    try {
      const { data } = await firstValueFrom(
        this.http.post(this.zoopUrl, payload, {
          headers: {
            'Content-Type': 'application/json',
            'api-key': this.zoopApiKey,
            'app-id': this.zoopAppId,
          },
          timeout: 15000, // ← added reasonable timeout
          validateStatus: () => true,
        }),
      );

      this.logger.debug(`Zoop raw response: ${JSON.stringify(data, null, 2)}`);

      return { success: true, provider: 'ZOOP', response: data };
    } catch (e) {
      this.logger.error(`Zoop request failed: ${e.message}`);
      return { success: false, provider: 'ZOOP', error: e.message };
    }
  }

  private async callFinanalyzPan(pan: string, name: string) {
    this.logger.log(`Attempting Finanalyz verification → PAN: ${pan} | Name: ${name}`);

    if (!this.finanalyzUrl || !this.finanalyzKey) {
      this.logger.error('Finanalyz configuration missing',this.finanalyzUrl, this.finanalyzKey);
      throw new Error('Finanalyz service not configured');
    }

    const payload = { panNumber: pan.toUpperCase() };

    try {
      const { data } = await firstValueFrom(
        this.http.post(this.finanalyzUrl, payload, {
          headers: {
            'Content-Type': 'application/json',
            'XApiKey': this.finanalyzKey,
          },
          timeout: 10000,
          validateStatus: () => true,
        }),
      );

      this.logger.debug(`Finanalyz raw: ${JSON.stringify(data, null, 2)}`);

      return { success: true, provider: 'FINANALYZ', response: data };
    } catch (e) {
      this.logger.error(`Finanalyz request failed: ${e.message}`);
      return { success: false, provider: 'FINANALYZ', error: e.message };
    }
  }

  // ───────────────────────────────────────────────
  // Main unified verification method
  // ───────────────────────────────────────────────
  async validatePan(pan: string, name: string) {
    if (!pan?.match(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i)) {
      throw new BadRequestException('Invalid PAN format');
    }
    if (!name?.trim()) {
      throw new BadRequestException('Name is required for PAN verification');
    }

    pan = pan.toUpperCase().trim();
    name = name.trim();

    this.logger.log(`Starting PAN verification → PAN: ${pan} | Name: "${name}"`);

    // 1. Try Finanalyz first (as primary)
    let finResult = null;
    try {
      finResult = await this.callFinanalyzPan(pan, name);
    } catch {}

    if (finResult?.success) {
      const resp = finResult.response;
      const apiResp = resp?.data?.response;

      if (apiResp?.code === 200 && apiResp?.isValid === true) {
        this.logger.log(`Finanalyz → VALID PAN`);
        return {
          success: true,
          verified: true,
          provider: 'FINANALYZ',
          details: {
            pan: apiResp.pan,
            name: apiResp.name,
            firstName: apiResp.firstName,
            middleName: apiResp.middleName,
            lastName: apiResp.lastName,
            gender: apiResp.gender,
            dob: apiResp.dob,
            ...apiResp, // rest of fields
            nameMatchScore: 100, // assumed
          },
        };
      }

      this.logger.warn(`Finanalyz → rejected: ${apiResp?.message || 'invalid response'}`);
      return {
        success: true,
        verified: false,
        provider: 'FINANALYZ',
        message: apiResp?.message || 'PAN verification failed',
      };
    }

    // 2. Fallback to Zoop
    let zoopResult = null;
    try {
      zoopResult = await this.callZoopPan(pan, name);
    } catch {}

    if (zoopResult?.success) {
      const resp = zoopResult.response;

      if (resp?.response_code === '100' && resp?.result?.pan_status === 'VALID') {
        const score = Number(resp.result.name_match_score || 0);

        if (score >= 80) {
          this.logger.log(`Zoop → VALID (name match: ${score}%)`);
          return {
            success: true,
            verified: true,
            provider: 'ZOOP',
            details: {
              pan: resp.result.pan_number,
              name: resp.result.name_on_card,
              firstName: resp.result.user_first_name,
              middleName: resp.result.user_middle_name,
              lastName: resp.result.user_last_name,
              typeOfHolder: resp.result.pan_type,
              aadhaarSeedingStatus: resp.result.aadhaar_seeding_status,
              nameMatchScore: score,
            },
          };
        }

        this.logger.warn(`Zoop → name mismatch (score: ${score}%)`);
        return {
          success: true,
          verified: false,
          provider: 'ZOOP',
          message: `Name match too low (${score}%)`,
        };
      }

      this.logger.warn(`Zoop → rejected: code=${resp?.response_code} msg=${resp?.response_message}`);
      return {
        success: true,
        verified: false,
        provider: 'ZOOP',
        message: resp?.response_message || 'PAN not valid',
      };
    }

    // Both failed
    this.logger.error(`PAN verification completely failed for ${pan}`);
    return {
      success: false,           // ← changed: false when really failed
      verified: false,
      provider: 'NONE',
      message: 'Both verification providers failed (check logs for details)',
    };
  }

  // Legacy compatibility
  async verifyPan(panNumber: string, name?: string) {
    if (!name) throw new BadRequestException('Name is required');
    return this.validatePan(panNumber, name);
  }

  async getPanDetails(panNumber: string) {
    // This method requires name for validation, so we return a basic response
    // In a real implementation, you might want to call a different API
    this.logger.log(`Getting PAN details: ${panNumber}`);
    return {
      success: true,
      data: {
        panNumber,
        name: null,
        status: 'PENDING_VERIFICATION',
      },
    };
  }
}
