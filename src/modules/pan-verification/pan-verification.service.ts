import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import FormData from 'form-data';
import { v4 as uuidv4 } from 'uuid';
import { GoogleVisionService } from '../ocr/google-vision.service';
import * as fs from 'fs';
import { parsePanText } from '../../utils/pan-parser.util';

// Multer file type
interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
  path?: string;
}

@Injectable()
export class PanVerificationService {
  private readonly logger = new Logger(PanVerificationService.name);

  private readonly zoopUrl: string;
  private readonly zoopApiKey: string;
  private readonly zoopAppId: string;

  private readonly finanalyzUrl: string;
  private readonly finanalyzOcrUrl: string;
  private readonly finanalyzKey: string;

  constructor(
    private readonly http: HttpService,
    private readonly googleVision: GoogleVisionService,
  ) {
    this.zoopUrl = process.env.ZOOP_PAN_API_URL ?? '';
    this.zoopApiKey = process.env.ZOOP_API_KEY ?? '';
    this.zoopAppId = process.env.ZOOP_APP_ID ?? '';

    this.finanalyzUrl = process.env.FINANALYZ_PAN_URL ?? '';
    this.finanalyzOcrUrl = process.env.FINANALYZ_OCR_URL ?? '';
    this.finanalyzKey = process.env.FINANALYZ_X_API_KEY ?? '';

    // Log config status once at startup
    this.logger.log(`Zoop config: url=${!!this.zoopUrl}, key=${!!this.zoopApiKey}, app=${!!this.zoopAppId}`);
    this.logger.log(`Finanalyz config: url=${!!this.finanalyzUrl}, ocr=${!!this.finanalyzOcrUrl}, key=${!!this.finanalyzKey}`);
  }

  // ───────────────────────────────────────────────
  // Primary OCR – Google Vision → Finanalyz fallback
  // ───────────────────────────────────────────────
  async ocrPan(file: MulterFile): Promise<{
    success: boolean;
    raw: any;
  }> {
    if (!file) throw new BadRequestException('PAN image file is required');

    let imageBuffer: Buffer;
    try {
      imageBuffer = file.buffer ?? (file.path ? await fs.promises.readFile(file.path) : null);
      if (!imageBuffer) throw new Error('No buffer or path available');
    } catch (e) {
      this.logger.error(`Failed to read PAN image: ${e.message}`);
      throw new BadRequestException('Invalid or unreadable PAN image');
    }

    this.logger.debug(`OCR started | size: ${imageBuffer.length} bytes | filename: ${file.originalname}`);

    // ── Google Vision ─────────────────────────────────────
    this.logger.log('Attempting OCR with Google Vision...');
    try {
      const lines = await this.googleVision.extractTextFromImage(imageBuffer);
      const fullText = lines.join('\n').trim();

      if (fullText.length === 0) {
        this.logger.warn('Google Vision returned empty text');
      } else {
        this.logger.debug(`Google Vision extracted (${lines.length} lines): ${fullText.substring(0, 200)}...`);
      }

      const isPaymentDoc =
        /payment|payments|paytm|upi/i.test(fullText);

      const { panNumber, name, dob, fatherName } = parsePanText(lines);

      if (panNumber && !isPaymentDoc) {
        this.logger.log(`Google Vision success → PAN: ${panNumber}, Name: ${name}`);
        return {
          success: true,
          raw: {
            provider: 'GOOGLE_VISION',
            response: {
              data: {
                pan_number: panNumber,
                name: name,
                dob: dob,
                father_name: fatherName,
              },
              doc_Name: 'PAN Card',
              message: 'success',
            },
          },
        };
      }

      this.logger.warn(
        `Google Vision fallback trigger: ${panNumber ? 'Payment doc detected' : 'No valid PAN found'}`,
      );
    } catch (e) {
      this.logger.error(`Google Vision OCR failed: ${e.message}`);
    }

    // ── Finanalyz OCR fallback ─────────────────────────────
    this.logger.log('Falling back to Finanalyz OCR...');

    if (!this.finanalyzOcrUrl || !this.finanalyzKey) {
      this.logger.error('Finanalyz OCR not configured');
      throw new BadRequestException('OCR service not available');
    }

    const form = new FormData();
    form.append('file', imageBuffer, {
      filename: file.originalname || 'pan.jpg',
      contentType: file.mimetype || 'image/jpeg',
    });

    try {
      const { data } = await firstValueFrom(
        this.http.post(this.finanalyzOcrUrl, form, {
          headers: {
            ...form.getHeaders(),
            accept: '*/*',
            XApiKey: this.finanalyzKey,
          },
          validateStatus: () => true,
        }),
      );

      this.logger.debug(`Finanalyz OCR raw: ${JSON.stringify(data, null, 2).substring(0, 400)}...`);

      if (data?.data) {
        const pan = data.data.pan_number ?? null;
        if (pan) {
          this.logger.log(`Finanalyz OCR success → PAN: ${pan}`);
          return {
            success: true,
            raw: { provider: 'FINANALYZ_OCR', response: data },
          };
        }
      }

      this.logger.warn('Finanalyz OCR did not return valid PAN');
      return {
        success: false,
        raw: { provider: 'FINANALYZ_OCR', response: data },
      };
    } catch (e) {
      this.logger.error(`Finanalyz OCR request failed: ${e.message}`);
      return {
        success: false,
        raw: { provider: 'FINANALYZ_OCR', error: e.message },
      };
    }
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
