import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

type Provider = 'DOQFY' | 'DIGIO';

export interface InitiateEsignParams {
  documentUrl: string;
  signerName: string;
  signerEmail?: string;
  signerMobile?: string;
  documentName?: string;
  callbackUrl?: string;
  redirectUrl?: string;
  expireInDays?: number;
  signType?: string;
  reason?: string;
  signPosition?: string;
  coordinates?: Record<string, any>;
}

@Injectable()
export class EsignService {
  private readonly logger = new Logger(EsignService.name);
  private readonly doqfy: AxiosInstance;
  private readonly digio: AxiosInstance;

  constructor(private readonly config: ConfigService) {
    this.doqfy = axios.create({
      baseURL: this.env(['DOQFY_BASE_URL', 'DOQUFY_BASE_URL']),
      timeout: this.envNumber('ESIGN_TIMEOUT_MS', 30000),
      headers: { 'Content-Type': 'application/json' },
    });

    this.digio = axios.create({
      baseURL: this.env('DIGIO_ESIGN_BASE_URL', 'https://api.digio.in'),
      timeout: this.envNumber('ESIGN_TIMEOUT_MS', 30000),
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async initiateEsign(
    paramsOrUrl: InitiateEsignParams | string,
    signerName?: string,
    signerEmail?: string,
  ) {
    const params =
      typeof paramsOrUrl === 'string'
        ? { documentUrl: paramsOrUrl, signerName, signerEmail }
        : paramsOrUrl;

    this.validateInitiate(params);

    return this.tryDoqfyThenDigio(
      () => this.createDoqfyRequest(params),
      () => this.createDigioRequest(params),
    );
  }

  async verifyEsign(esignId: string) {
    this.validateId(esignId);
    const reference = this.parseReference(esignId);

    if (reference.provider === 'DOQFY') {
      return this.callProvider('DOQFY', () => this.getDoqfyRequest(reference.id));
    }
    if (reference.provider === 'DIGIO') {
      return this.callProvider('DIGIO', () => this.getDigioRequest(reference.id));
    }

    return this.tryDoqfyThenDigio(
      () => this.getDoqfyRequest(reference.id),
      () => this.getDigioRequest(reference.id),
    );
  }

  async getEsignStatus(esignId: string) {
    this.validateId(esignId);
    const reference = this.parseReference(esignId);

    if (reference.provider === 'DOQFY') {
      return this.callProvider('DOQFY', () => this.getDoqfyRequest(reference.id));
    }
    if (reference.provider === 'DIGIO') {
      return this.callProvider('DIGIO', () => this.getDigioRequest(reference.id));
    }

    return this.tryDoqfyThenDigio(
      () => this.getDoqfyRequest(reference.id),
      () => this.getDigioRequest(reference.id),
    );
  }

  private async tryDoqfyThenDigio(doqfyCall: () => Promise<any>, digioCall: () => Promise<any>) {
    try {
      this.logger.log('Calling Doqfy eSign');
      const result = await doqfyCall();
      this.logger.log(`Doqfy eSign succeeded: ${result?.data?.esignId}`);
      return result;
    } catch (doqfyError: any) {
      this.logger.warn(`Doqfy failed, trying Digio fallback: ${this.errorMessage(doqfyError)}`);
      if (doqfyError?.response) {
        this.logger.warn(
          `Doqfy response: status=${doqfyError.response.status} body=${this.preview(doqfyError.response.data)}`,
        );
      } else if (doqfyError?.code) {
        this.logger.warn(`Doqfy network error: code=${doqfyError.code}`);
      }

      try {
        const result = await digioCall();
        result.data.fallbackAttempted = true;
        result.data.fallbackFrom = 'DOQFY';
        result.data.fallbackReason = this.errorMessage(doqfyError);
        return result;
      } catch (digioError) {
        this.logger.error(`Digio fallback failed: ${this.errorMessage(digioError)}`);
        throw new HttpException(
          {
            message: 'Both eSign providers failed',
            errors: {
              doqfy: this.errorMessage(doqfyError),
              digio: this.errorMessage(digioError),
            },
          },
          HttpStatus.BAD_GATEWAY,
        );
      }
    }
  }

  private async callProvider(provider: Provider, call: () => Promise<any>) {
    try {
      return await call();
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`${provider} eSign request failed: ${this.errorMessage(error)}`);
      const status = error?.response?.status;
      throw new HttpException(
        { message: `${provider} eSign request failed`, error: this.errorMessage(error) },
        status && status < 500 ? status : HttpStatus.BAD_GATEWAY,
      );
    }
  }

  private async createDoqfyRequest(params: InitiateEsignParams) {
    this.requireDoqfy();

    const useCoordinates = !!params.coordinates && Object.keys(params.coordinates).length > 0;
    const payload = {
      file_name: params.documentName || `esign-${Date.now()}.pdf`,
      is_bulk: false,
      order_details: [
        {
          branch_id: Number(this.env(['DOQFY_BRANCH_ID', 'DOQUFY_BRANCH_ID'])),
          referance_id: `ESIGN_${Date.now()}`,
          estamps: [],
          esigns: {
            party_users: [
              {
                name: params.signerName,
                email: params.signerEmail || '',
                contact_number: params.signerMobile || '',
                method: (params.signType || this.env('DOQFY_ESIGN_METHOD', 'AADHAAR')).toUpperCase(),
                pages: 'ALL',
                remark: params.reason || 'Agreement signing',
                sign_position: useCoordinates ? 'DRAG_DROP' : params.signPosition || 'BOTTOM_RIGHT',
                position_details: useCoordinates ? params.coordinates : {},
                redirect_url: params.redirectUrl || this.env(['ESIGN_REDIRECT_URL', 'AADHAAR_REDIRECT_URL']),
              },
            ],
            witness_users: [],
          },
        },
      ],
      document: await this.documentToBase64(params.documentUrl),
    };

    const { data } = await this.doqfy.post('/order/cat/upload/', payload, {
      headers: this.doqfyHeaders(),
    });

    const orderId = data?.content?.order_id;
    if (!orderId) {
      throw new Error(`Doqfy did not return an order_id: ${data?.message || JSON.stringify(data)}`);
    }

    // The upload response has no sign URL; it comes from the order details call.
    // A failure here should not fail the eSign that was already created.
    let order: any;
    try {
      order = await this.fetchDoqfyOrder(String(orderId));
    } catch (error) {
      this.logger.warn(`Doqfy order ${orderId} created but details fetch failed: ${this.errorMessage(error)}`);
    }

    return this.doqfyResult(String(orderId), order, { upload: data, order: order?.raw }, params);
  }

  private async getDoqfyRequest(orderId: string) {
    this.requireDoqfy();

    const order = await this.fetchDoqfyOrder(orderId);
    return this.doqfyResult(orderId, order, order.raw);
  }

  private async fetchDoqfyOrder(orderId: string) {
    const { data } = await this.doqfy.get('/order/orders/', {
      params: { detail: 1, order_ids: orderId },
      headers: this.doqfyHeaders(),
    });

    const content = Array.isArray(data?.content) ? data.content[0] : undefined;
    if (!content) {
      throw new Error(`Doqfy order ${orderId} not found: ${data?.message || JSON.stringify(data)}`);
    }

    return { content, raw: data };
  }

  private doqfyResult(
    orderId: string,
    order: { content: any } | undefined,
    raw: any,
    params: Partial<InitiateEsignParams> = {},
  ) {
    const content = order?.content;
    const esigns: any[] = Array.isArray(content?.esign) ? content.esign : [];
    const firstSigner = esigns[0];

    return {
      success: true,
      data: {
        esignId: orderId,
        provider: 'DOQFY' as Provider,
        providerReferenceId: `doqfy:${orderId}`,
        status: this.normalizeStatus(
          firstSigner?.status || firstSigner?.esign_status || content?.status || content?.order_status,
        ),
        signerName: params.signerName || firstSigner?.name,
        signerEmail: params.signerEmail || firstSigner?.email,
        signerMobile: params.signerMobile || firstSigner?.contact_number,
        signingUrl: firstSigner?.sign_url,
        signingUrls: esigns
          .filter((item) => item?.sign_url)
          .map((item, index) => ({ partyNo: index + 1, name: item?.name, signUrl: item.sign_url })),
        createdAt: content?.created_at || content?.created_on,
        raw,
      },
    };
  }

  private async createDigioRequest(params: InitiateEsignParams) {
    this.requireDigio();

    const identifier = params.signerEmail || params.signerMobile;
    const { data } = await this.digio.post(
      '/v2/client/document/uploadpdf',
      {
        signers: [
          {
            identifier,
            name: params.signerName,
            sign_type: params.signType || this.env('DIGIO_ESIGN_SIGN_TYPE', 'aadhaar'),
            reason: params.reason || 'Agreement signing',
          },
        ],
        file_name: params.documentName || `esign-${Date.now()}.pdf`,
        file_data: await this.documentToBase64(params.documentUrl),
        expire_in_days: params.expireInDays || this.envNumber('DIGIO_ESIGN_EXPIRE_IN_DAYS', 1),
        display_on_page: this.env('DIGIO_ESIGN_DISPLAY_ON_PAGE', 'all'),
        notify_signers: true,
        send_sign_link: true,
        ...(params.coordinates ? { sign_coordinates: params.coordinates } : {}),
      },
      { headers: this.digioHeaders() },
    );

    return this.success('DIGIO', data, params);
  }

  private async getDigioRequest(esignId: string) {
    this.requireDigio();

    const { data } = await this.digio.get(`/v2/client/document/${encodeURIComponent(esignId)}`, {
      headers: this.digioHeaders(),
    });

    return this.success('DIGIO', data);
  }

  private success(provider: Provider, raw: any, params: Partial<InitiateEsignParams> = {}) {
    const body = raw?.data || raw?.model || raw?.result || raw;
    const esignId =
      body?.esignId ||
      body?.esign_id ||
      body?.documentId ||
      body?.document_id ||
      body?.requestId ||
      body?.request_id ||
      body?.id;

    return {
      success: true,
      data: {
        esignId,
        provider,
        providerReferenceId: esignId ? `${provider.toLowerCase()}:${esignId}` : undefined,
        status: this.normalizeStatus(body?.status || body?.agreement_status),
        signerName: params.signerName || body?.signerName || body?.signer_name,
        signerEmail: params.signerEmail || body?.signerEmail || body?.signer_email,
        signerMobile: params.signerMobile || body?.signerMobile || body?.signer_mobile,
        signingUrl: body?.signingUrl || body?.signing_url || body?.signUrl || body?.sign_url || body?.url,
        signedDocumentUrl: body?.signedDocumentUrl || body?.signed_document_url || body?.downloadUrl || body?.download_url,
        createdAt: body?.createdAt || body?.created_at,
        raw,
      },
    };
  }

  private async documentToBase64(documentUrl: string) {
    if (documentUrl.startsWith('data:')) return documentUrl.split(',').pop();
    if (!/^https?:\/\//i.test(documentUrl)) return documentUrl;

    const response = await axios.get<ArrayBuffer>(documentUrl, {
      responseType: 'arraybuffer',
      timeout: this.envNumber('ESIGN_TIMEOUT_MS', 30000),
    });

    return Buffer.from(response.data).toString('base64');
  }

  private doqfyHeaders() {
    return {
      'api-key': this.env(['DOQFY_API_KEY', 'DOQUFY_API_KEY']),
      'secret-key': this.env(['DOQFY_SECRET_KEY', 'DOQUFY_SECRET_KEY']),
    };
  }

  private digioHeaders() {
    const clientId = this.env('DIGIO_ESIGN_CLIENT_ID');
    const clientSecret = this.env('DIGIO_ESIGN_CLIENT_SECRET');

    return {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    };
  }

  private requireDoqfy() {
    const missing = [
      ['DOQFY_BASE_URL', 'DOQUFY_BASE_URL'],
      ['DOQFY_API_KEY', 'DOQUFY_API_KEY'],
      ['DOQFY_SECRET_KEY', 'DOQUFY_SECRET_KEY'],
      ['DOQFY_BRANCH_ID', 'DOQUFY_BRANCH_ID'],
    ]
      .filter((keys) => !this.env(keys))
      .map((keys) => keys[0]);

    if (missing.length) {
      throw new Error(`Doqfy is not configured (missing ${missing.join(', ')})`);
    }
  }

  private requireDigio() {
    if (!this.env('DIGIO_ESIGN_CLIENT_ID') || !this.env('DIGIO_ESIGN_CLIENT_SECRET')) {
      throw new Error('Digio eSign is not configured (DIGIO_ESIGN_CLIENT_ID / DIGIO_ESIGN_CLIENT_SECRET)');
    }
  }

  private validateInitiate(params: Partial<InitiateEsignParams>) {
    if (!params.documentUrl) throw new BadRequestException('documentUrl is required');
    if (!params.signerName) throw new BadRequestException('signerName is required');
    if (!params.signerEmail && !params.signerMobile) {
      throw new BadRequestException('signerEmail or signerMobile is required');
    }
  }

  private validateId(esignId: string) {
    if (!esignId) throw new BadRequestException('esignId is required');
  }

  private parseReference(esignId: string): { provider?: Provider; id: string } {
    const separator = esignId.indexOf(':');
    const provider = esignId.slice(0, separator);
    const id = esignId.slice(separator + 1);

    if (separator < 0 || !id) return { id: esignId };
    if (provider.toLowerCase() === 'digio') return { provider: 'DIGIO', id };
    if (provider.toLowerCase() === 'doqfy' || provider.toLowerCase() === 'doqufy') {
      return { provider: 'DOQFY', id };
    }

    return { id: esignId };
  }

  private normalizeStatus(status?: string) {
    const value = String(status || 'PENDING').toUpperCase();

    if (['REQUESTED', 'INITIATED', 'SENT'].includes(value)) return 'PENDING';
    if (['SIGNED', 'SUCCESS', 'VERIFIED'].includes(value)) return 'COMPLETED';
    if (['CANCELLED', 'CANCELED', 'REJECTED', 'FAILURE'].includes(value)) return 'FAILED';

    return value;
  }

  private errorMessage(error: any) {
    const data = error?.response?.data;
    let message = data?.message || data?.error_message || data?.error || error?.message || error;

    // HTML error pages (e.g. a Django 404) are huge; keep just the <title>.
    if (typeof data === 'string' && /<html/i.test(data)) {
      message = data.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim() || error?.message;
    }

    const text = typeof message === 'string' ? message : JSON.stringify(message);
    const config = error?.config;
    if (!config?.url) return text;

    const url = `${config.baseURL || ''}${config.url}`;
    return `${text} [${String(config.method).toUpperCase()} ${url} -> ${error?.response?.status ?? 'no response'}]`;
  }

  private preview(data: any, max = 1000) {
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    return text && text.length > max ? `${text.slice(0, max)}...` : text;
  }

  private env(keys: string | string[], fallback = '') {
    const names = Array.isArray(keys) ? keys : [keys];

    for (const name of names) {
      const value = this.config.get<string>(name) || process.env[name];
      if (value) return String(value).trim();
    }

    return fallback;
  }

  private envNumber(key: string, fallback: number) {
    const value = Number(this.env(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }
}
