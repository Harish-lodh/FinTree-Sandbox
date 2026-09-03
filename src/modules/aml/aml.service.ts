import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { DOMParser } from '@xmldom/xmldom';
import { XMLParser } from 'fast-xml-parser';
import {
  KeyObject,
  X509Certificate,
  constants,
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  privateDecrypt,
  publicEncrypt,
  randomBytes,
} from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { Agent as HttpAgent } from 'http';
import { Agent as HttpsAgent, AgentOptions as HttpsAgentOptions } from 'https';
import * as path from 'path';
import { firstValueFrom } from 'rxjs';
import { SignedXml } from 'xml-crypto';
import { v4 as uuidv4 } from 'uuid';
import { ApiTransactionLogsService } from '../api-transaction-logs/api-transaction-logs.service';
import { TrackwizzAmlVerificationDto } from './dto/trackwizz-aml.dto';

interface TrackwizzScreeningRequestData {
  RequestId: string;
  RecordIdentifier: string;
  ApplicationRefNumber: string;
  IntermediaryCode: string;
  SourceSystemName: string;
  ParentCompany: string;
  FirstName: string;
  MiddleName: string;
  LastName: string;
  CustomerCategory: 'IND' | 'NON IND';
  Gender: string;
  Pan: string;
  Din: string;
  Cin: string;
  PassportNumber: string;
  DrivingLicenseNumber: string;
  DateOfBirth: string;
  BirthCity: string;
  CountryOfBirth: string;
  Nationalities: string[];
  CorrespondenceAddressLine1: string;
  CorrespondenceAddressLine2: string;
  CorrespondenceAddressLine3: string;
  CorrespondenceAddressCity: string;
  CorrespondenceAddressState: string;
  CorrespondenceAddressCountry: string;
  CorrespondenceAddressPinCode: string;
  PermanentAddressLine1: string;
  PermanentAddressLine2: string;
  PermanentAddressLine3: string;
  PermanentAddressCity: string;
  PermanentAddressState: string;
  PermanentAddressCountry: string;
  PermanentAddressPinCode: string;
  WorkMobileISD: string;
  WorkMobileNumber: string;
  PersonalMobileISD: string;
  PersonalMobileNumber: string;
  WorkEmail: string;
  PersonalEmail: string;
  Tags: string[];
  ProductSegments: string[];
  ScreeningCategory: string;
}

type TrackwizzAs504Decision = 'PROCEED' | 'REVIEW' | 'STOP' | 'ERROR';

interface TrackwizzAs504RequestData {
  requestId: string;
  lan: string;
  partnerCode: string;
  customerCode: string;
  applicationRefNumber: string;
  fullName: string;
  fatherName: string;
  pan: string;
  mobile: string;
  email: string;
  dob: string;
  gender: string;
  createdAt: string;
  force: boolean;
  rawPayload?: Record<string, any>;
}

interface TrackwizzAuditPaths {
  requestPayloadPath?: string;
  responsePayloadPath?: string;
  hitDetailsPath?: string;
  reportPath?: string;
}

type KeyMaterial = string | Buffer;

@Injectable()
export class AmlService {
  private readonly logger = new Logger(AmlService.name);
  private readonly xmlParser = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    removeNSPrefix: true,
    trimValues: true,
  });

  private readonly as504Url: string;
  private readonly apiUrl: string;
  private readonly apiToken: string;
  private readonly trackwizzDomain: string;
  private readonly cluster: string;
  private readonly timeoutMs: number;
  private readonly defaultParentCompany: string;
  private readonly defaultSourceSystemName: string;
  private readonly defaultIntermediaryCode: string;
  private readonly privateKeyPassphrase: string;
  private readonly aesAlgorithm: string;
  private readonly xmlEncoding: BufferEncoding;
  private readonly shouldVerifyResponseSignature: boolean;
  private readonly auditBasePath: string;
  private readonly allowProceedOnTransportFailure: boolean;
  private readonly throwOnTransportFailure: boolean;
  private readonly includeReportDataInResponse: boolean;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly apiTransactionLogsService: ApiTransactionLogsService,
  ) {
    this.trackwizzDomain = this.configValue('TW_DOMAIN', 'TRACKWIZZ_DOMAIN');
    this.as504Url =
      this.configValue('TW_AS504_URL', 'TRACKWIZZ_AS504_URL') ||
      this.urlValue(this.trackwizzDomain);
    this.apiUrl = this.configValue('TRACKWIZZ_AML_URL', 'TRACKWIZZ_A64_URL');
    this.apiToken = this.configValue('TW_API_TOKEN', 'TRACKWIZZ_API_TOKEN');
    this.cluster =
      this.configValue('TW_CLUSTER', 'TRACKWIZZ_CLUSTER') || 'CL1_User';
    this.timeoutMs = this.positiveNumber(
      this.configValue('TW_TIMEOUT_MS', 'TRACKWIZZ_TIMEOUT_MS'),
      30000,
    );
    this.defaultParentCompany = this.config.get<string>(
      'TRACKWIZZ_PARENT_COMPANY',
      '',
    );
    this.defaultSourceSystemName =
      this.configValue('TW_SOURCE_SYSTEM_NAME', 'TRACKWIZZ_SOURCE_SYSTEM_NAME') ||
      'FintreeLMS';
    this.defaultIntermediaryCode = this.config.get<string>(
      'TRACKWIZZ_INTERMEDIARY_CODE',
      '',
    );
    this.privateKeyPassphrase = this.config.get<string>(
      'TRACKWIZZ_PRIVATE_KEY_PASSPHRASE',
      '',
    );
    this.aesAlgorithm = this.config.get<string>(
      'TRACKWIZZ_AES_ALGORITHM',
      'aes-256-ecb',
    );
    this.xmlEncoding = this.config.get<BufferEncoding>(
      'TRACKWIZZ_XML_ENCODING',
      'utf8',
    );
    this.shouldVerifyResponseSignature =
      this.config
        .get<string>('TRACKWIZZ_VERIFY_RESPONSE_SIGNATURE', 'true')
        .toLowerCase() !== 'false';
    this.auditBasePath =
      this.configValue('TW_AUDIT_DIR', 'TRACKWIZZ_AUDIT_DIR') ||
      path.join('uploads', 'trackwizz');
    this.allowProceedOnTransportFailure = this.envFlag(
      'TW_ALLOW_ON_TRANSPORT_FAILURE',
      false,
    );
    this.throwOnTransportFailure = this.envFlag(
      'TW_THROW_ON_TRANSPORT_FAILURE',
      false,
    );
    this.includeReportDataInResponse = this.envFlag(
      'TW_INCLUDE_REPORT_DATA_IN_RESPONSE',
      false,
    );

    this.logger.log(
      `TrackWizz AML config: as504Url=${!!this.as504Url}, a64Url=${!!this.apiUrl}, token=${!!this.apiToken}, cluster=${!!this.cluster}, source=${!!this.defaultSourceSystemName}, clientCert=${this.hasClientCertificate()}, encryptionCert=${this.hasKeyMaterial('TRACKWIZZ_ENCRYPTION_CERT')}, privateKey=${this.hasKeyMaterial('TRACKWIZZ_PRIVATE_KEY')}`,
    );
    this.warnIfTokenLooksInvalid();
  }

  async verifyWithTrackwizz(dto: TrackwizzAmlVerificationDto) {
    if (this.as504Url) {
      return this.verifyWithTrackwizzAs504(dto);
    }

    return this.verifyWithTrackwizzA64(dto);
  }

  getTrackwizzReport(requestId: string): { filePath: string; fileName: string } {
    const safeRequestId = this.safeFileName(requestId);

    if (!safeRequestId) {
      throw new BadRequestException('requestId is required');
    }

    const reportDir = path.resolve(process.cwd(), this.auditBasePath, 'reports');
    const fileName = `${safeRequestId}.pdf`;
    const filePath = path.resolve(reportDir, fileName);

    if (!this.isPathInside(reportDir, filePath)) {
      throw new BadRequestException('Invalid TrackWizz report requestId');
    }

    if (!existsSync(filePath)) {
      throw new NotFoundException('TrackWizz PDF report not found');
    }

    return { filePath, fileName };
  }

  private async verifyWithTrackwizzAs504(dto: TrackwizzAmlVerificationDto) {
    this.assertAs504Configured();

    const requestData = this.createAs504RequestData(dto);
    const duplicateKey = this.createAs504DuplicateKey(requestData);

    if (!requestData.force) {
      const duplicateResponse =
        await this.findDuplicateAs504Screening(duplicateKey, requestData);
      if (duplicateResponse) {
        return duplicateResponse;
      }
    }

    const payload = this.createAs504Payload(requestData);
    const auditPaths: TrackwizzAuditPaths = {
      requestPayloadPath: this.writeAuditJson(
        'requests',
        requestData.requestId,
        payload,
      ),
    };
    const startedAt = Date.now();

    await this.logTrackwizzAudit({
      callerId: duplicateKey,
      endpoint: 'AS504/request',
      requestPayload: {
        requestId: requestData.requestId,
        lan: requestData.lan,
        partnerCode: requestData.partnerCode,
        customerCode: requestData.customerCode,
        payloadPath: auditPaths.requestPayloadPath,
      },
      status: 'pending',
    });

    this.logger.log(
      `Starting TrackWizz AS504 AML screening requestId=${requestData.requestId}`,
    );
    this.logger.debug(
      `TrackWizz AS504 request payload ${JSON.stringify(
        this.redactSensitive(payload),
      )}`,
    );

    try {
      const response = await firstValueFrom(
        this.http.post(this.as504Url, payload, {
          headers: this.createAs504Headers(),
          responseType: 'text',
          timeout: this.timeoutMs,
          timeoutErrorMessage: `TrackWizz AS504 timed out after ${this.timeoutMs}ms`,
          transformResponse: [(data) => data],
          httpAgent: new HttpAgent({ keepAlive: false }),
          httpsAgent: this.createTrackwizzHttpsAgent(),
          proxy: this.shouldUseProxy() ? undefined : false,
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          validateStatus: () => true,
        }),
      );
      const durationMs = Date.now() - startedAt;
      const rawResponse = this.parseProviderPayload(response.data);
      let normalized = this.createAs504NormalizedResponse(
        rawResponse,
        requestData.requestId,
        response.status,
      );

      if (response.status < 200 || response.status >= 300) {
        this.logger.warn(
          `TrackWizz AS504 returned status=${response.status} requestId=${requestData.requestId}`,
        );

        if (normalized.data.decision !== 'ERROR') {
          normalized = this.createAs504TransportFailureResponse(
            requestData.requestId,
            response.status,
            rawResponse,
          );
        }
      }

      Object.assign(
        auditPaths,
        this.writeAs504ResponseArtifacts(
          requestData.requestId,
          rawResponse,
          normalized.data,
        ),
      );
      normalized.data.audit = auditPaths;

      await this.logTrackwizzAudit({
        callerId: duplicateKey,
        endpoint: 'AS504/response',
        requestPayload: {
          requestId: requestData.requestId,
          lan: requestData.lan,
          partnerCode: requestData.partnerCode,
          customerCode: requestData.customerCode,
          payloadPath: auditPaths.requestPayloadPath,
        },
        responseData: {
          normalized: this.withoutLargeAs504Fields(normalized),
          artifacts: auditPaths,
        },
        status:
          normalized.data.transportFailure || normalized.data.decision === 'ERROR'
            ? 'error'
            : 'success',
        durationMs,
      });

      await this.logSeparatedAs504Artifacts(
        duplicateKey,
        requestData.requestId,
        normalized.data,
        auditPaths,
        durationMs,
      );

      return this.createAs504PublicResponse(normalized);
    } catch (error) {
      const durationMs = Date.now() - startedAt;

      if (this.throwOnTransportFailure) {
        await this.logTrackwizzAudit({
          callerId: duplicateKey,
          endpoint: 'AS504/transport-error',
          requestPayload: {
            requestId: requestData.requestId,
            lan: requestData.lan,
            partnerCode: requestData.partnerCode,
            customerCode: requestData.customerCode,
            payloadPath: auditPaths.requestPayloadPath,
          },
          responseData: this.createTransportErrorAuditPayload(error),
          status: 'error',
          durationMs,
        });

        throw error;
      }

      if (this.isProviderTimeoutOrAbort(error)) {
        this.logger.error(
          `TrackWizz AS504 timeout/abort requestId=${requestData.requestId} timeoutMs=${this.timeoutMs} code=${error?.code || 'UNKNOWN'}`,
        );
      } else if (this.isClientCertificateError(error)) {
        this.logger.error(
          `TrackWizz AS504 TLS client certificate error requestId=${requestData.requestId} code=${error?.code || 'UNKNOWN'}`,
        );
      } else {
        this.logger.error(
          `TrackWizz AS504 request failed requestId=${requestData.requestId}: code=${error?.code || 'UNKNOWN'} status=${error?.response?.status || 'NO_STATUS'} message=${error.message}`,
        );
      }

      const normalized: any = this.createAs504TransportErrorResponse(
        requestData.requestId,
        error,
      );
      Object.assign(
        auditPaths,
        this.writeAs504ResponseArtifacts(
          requestData.requestId,
          this.createTransportErrorAuditPayload(error),
          normalized.data,
        ),
      );
      normalized.data.audit = auditPaths;

      await this.logTrackwizzAudit({
        callerId: duplicateKey,
        endpoint: 'AS504/transport-error',
        requestPayload: {
          requestId: requestData.requestId,
          lan: requestData.lan,
          partnerCode: requestData.partnerCode,
          customerCode: requestData.customerCode,
          payloadPath: auditPaths.requestPayloadPath,
        },
        responseData: {
          normalized,
          artifacts: auditPaths,
        },
        status: 'error',
        durationMs,
      });

      return this.createAs504PublicResponse(normalized);
    }
  }

  private async verifyWithTrackwizzA64(dto: TrackwizzAmlVerificationDto) {
    this.assertA64Configured();

    const requestData = this.createScreeningRequest(dto, true);
    const requestDataXml = this.createRequestDataXml(requestData);
    const encryptedRequestXml = this.createEncryptedRequestXml(requestDataXml);
    const signedRequestXml = this.signXml(encryptedRequestXml);

    this.logger.log(
      `Starting TrackWizz AML screening requestId=${requestData.RequestId}`,
    );

    try {
      const response = await firstValueFrom(
        this.http.post(this.apiUrl, signedRequestXml, {
          headers: {
            'Content-Type': 'application/xml',
            Accept: 'application/xml',
          },
          responseType: 'text',
          timeout: this.timeoutMs,
          proxy: this.shouldUseProxy() ? undefined : false,
          validateStatus: () => true,
        }),
      );

      if (response.status < 200 || response.status >= 300) {
        throw new HttpException(
          'TrackWizz AML screening request failed',
          response.status || HttpStatus.BAD_GATEWAY,
        );
      }

      return this.createNormalizedResponse(
        response.data,
        requestData.RequestId,
        false,
      );
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error(
        `TrackWizz AML request failed requestId=${requestData.RequestId}: ${error.message}`,
      );

      throw new HttpException(
        error?.message || 'TrackWizz AML screening failed',
        error?.response?.status || HttpStatus.BAD_GATEWAY,
      );
    }
  }

  private assertAs504Configured() {
    const missing = [
      !this.as504Url && 'TW_AS504_URL or TW_DOMAIN',
      !this.apiToken && 'TW_API_TOKEN',
      !this.cluster && 'TW_CLUSTER',
    ].filter(Boolean);

    if (missing.length) {
      throw new InternalServerErrorException(
        `TrackWizz AS504 configuration missing: ${missing.join(', ')}`,
      );
    }
  }

  private assertA64Configured() {
    const missing = [
      !this.apiUrl && 'TRACKWIZZ_AML_URL',
      !this.apiToken && 'TW_API_TOKEN or TRACKWIZZ_API_TOKEN',
      !this.hasKeyMaterial('TRACKWIZZ_ENCRYPTION_CERT') &&
        'TRACKWIZZ_ENCRYPTION_CERT, TRACKWIZZ_ENCRYPTION_CERT_BASE64 or TRACKWIZZ_ENCRYPTION_CERT_PATH',
      !this.hasKeyMaterial('TRACKWIZZ_PRIVATE_KEY') &&
        'TRACKWIZZ_PRIVATE_KEY, TRACKWIZZ_PRIVATE_KEY_BASE64 or TRACKWIZZ_PRIVATE_KEY_PATH',
    ].filter(Boolean);

    if (missing.length) {
      throw new InternalServerErrorException(
        `TrackWizz A64 AML configuration missing: ${missing.join(', ')}`,
      );
    }
  }

  private createAs504Headers(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, application/xml, text/plain',
      'Accept-Encoding': 'identity',
      Connection: 'close',
      APIToken: this.apiToken,
      Cluster: this.cluster,
      Domain:
        this.configValue('TW_DOMAIN_HEADER', 'TRACKWIZZ_DOMAIN_HEADER') ||
        this.trackwizzDomain ||
        this.as504Url,
      sourceSystemName: this.defaultSourceSystemName,
    };

    return headers;
  }

  private createTrackwizzHttpsAgent(): HttpsAgent {
    const options: HttpsAgentOptions = {
      keepAlive: false,
      rejectUnauthorized: this.envFlag('TW_REJECT_UNAUTHORIZED', true),
    };
    const pfx =
      this.getOptionalKeyMaterial('TW_CLIENT_PFX') ||
      this.getOptionalKeyMaterial('TW_PFX') ||
      this.getOptionalKeyMaterial('TRACKWIZZ_CLIENT_PFX');
    const passphrase = this.configValue(
      'TW_CLIENT_PFX_PASSPHRASE',
      'TW_CLIENT_PFX_PASSWORD',
      'TW_CLIENT_CERT_PASSPHRASE',
      'TW_CLIENT_CERT_PASSWORD',
      'TRACKWIZZ_CLIENT_PFX_PASSPHRASE',
      'TRACKWIZZ_CLIENT_PFX_PASSWORD',
      'TRACKWIZZ_CLIENT_CERT_PASSPHRASE',
      'TRACKWIZZ_CLIENT_CERT_PASSWORD',
    );

    if (pfx) {
      options.pfx = pfx;
      if (passphrase) {
        options.passphrase = passphrase;
      }

      return new HttpsAgent(options);
    }

    const cert =
      this.getOptionalKeyMaterial('TW_CLIENT_CERT') ||
      this.getOptionalKeyMaterial('TW_CERT') ||
      this.getOptionalKeyMaterial('TRACKWIZZ_CLIENT_CERT');
    const key =
      this.getOptionalKeyMaterial('TW_CLIENT_KEY') ||
      this.getOptionalKeyMaterial('TW_KEY') ||
      this.getOptionalKeyMaterial('TRACKWIZZ_CLIENT_KEY');

    if (cert) {
      options.cert = cert;
    }

    if (key) {
      options.key = key;
    }

    if (passphrase) {
      options.passphrase = passphrase;
    }

    const ca =
      this.getOptionalKeyMaterial('TW_CA_CERT') ||
      this.getOptionalKeyMaterial('TW_CA') ||
      this.getOptionalKeyMaterial('TRACKWIZZ_CA_CERT');
    if (ca) {
      options.ca = ca;
    }

    return new HttpsAgent(options);
  }

  private createAs504RequestData(
    dto: TrackwizzAmlVerificationDto,
  ): TrackwizzAs504RequestData {
    const rawPayload = this.rawAs504Payload(dto);
    const rawCustomer = this.firstFrom(rawPayload?.customerList);
    const fullName = this.clean(
      dto.fullName || dto.name || rawCustomer?.firstName,
    ).replace(/\s+/g, ' ');
    const pan = this.normalizePan(dto.pan || rawCustomer?.pan);
    const mobile = this.normalizeIndianMobile(
      dto.mobile || rawCustomer?.personalMobileNumber,
    );
    const email = this.clean(dto.email || rawCustomer?.personalEmail);
    const fallbackIdentifier = this.createAs504FallbackIdentifier({
      applicationRefNumber:
        dto.applicationRefNumber || rawCustomer?.applicationRefNumber,
      pan,
      mobile,
      email,
      fullName,
    });
    const lan = this.clean(
      dto.lan || rawCustomer?.uniqueIdentifier || fallbackIdentifier,
    );
    const customerCode = this.clean(
      dto.customerCode ||
        rawCustomer?.sourceSystemCustomerCode ||
        `${this.defaultSourceSystemName}-${lan}`,
    );

    if (!fullName && !mobile && !email && !pan) {
      throw new BadRequestException(
        'At least one identifier is required: fullName, mobile, email, or pan',
      );
    }

    return {
      requestId: this.createAs504RequestId(lan, rawPayload?.requestId),
      lan,
      partnerCode: this.deriveAs504PartnerCode(
        dto.partnerCode,
        customerCode,
        lan,
      ),
      customerCode,
      applicationRefNumber: this.clean(
        dto.applicationRefNumber || rawCustomer?.applicationRefNumber,
      ),
      fullName,
      fatherName: this.clean(
        dto.fatherName || rawCustomer?.fatherFirstName,
      ).replace(/\s+/g, ' '),
      pan,
      mobile,
      email,
      dob: this.formatTrackwizzDate(
        dto.dob || rawCustomer?.dateofBirth,
        'dob',
      ),
      gender: this.normalizeGender(dto.gender || rawCustomer?.gender),
      createdAt:
        this.formatTrackwizzDate(
          dto.createdAt || rawCustomer?.sourceSystemCustomerCreationDate,
          'createdAt',
        ) || this.todayTrackwizzDate(),
      force: dto.force === true,
      rawPayload,
    };
  }

  private createAs504FallbackIdentifier(input: {
    applicationRefNumber?: string;
    pan?: string;
    mobile?: string;
    email?: string;
    fullName?: string;
  }): string {
    const stableIdentifier =
      this.clean(input.applicationRefNumber) ||
      this.clean(input.pan) ||
      this.clean(input.mobile) ||
      this.clean(input.email) ||
      this.clean(input.fullName);

    return this.safeFileName(stableIdentifier || `${Date.now()}`);
  }

  private rawAs504Payload(
    dto: TrackwizzAmlVerificationDto,
  ): Record<string, any> | undefined {
    if (!Array.isArray(dto.customerList) || dto.customerList.length === 0) {
      return undefined;
    }

    return dto as Record<string, any>;
  }

  private createAs504RequestId(lan: string, providedRequestId?: string): string {
    const requestId = this.clean(providedRequestId);
    if (requestId) {
      return requestId;
    }

    return `LAN-${lan}-${Date.now()}`;
  }

  private createAs504DuplicateKey(data: TrackwizzAs504RequestData): string {
    return `TRACKWIZZ_AS504:${data.partnerCode}:${data.lan}`;
  }

  private deriveAs504PartnerCode(
    partnerCode: string,
    customerCode: string,
    lan: string,
  ): string {
    const explicitPartnerCode = this.clean(partnerCode);
    if (explicitPartnerCode) {
      return explicitPartnerCode;
    }

    const normalizedCustomerCode = this.clean(customerCode);
    const normalizedLan = this.clean(lan);
    const suffix = `-${normalizedLan}`.toLowerCase();

    if (normalizedCustomerCode.toLowerCase().endsWith(suffix)) {
      return normalizedCustomerCode.slice(0, -suffix.length) || customerCode;
    }

    return normalizedCustomerCode || 'unknown-partner';
  }

  private async findDuplicateAs504Screening(
    duplicateKey: string,
    requestData: TrackwizzAs504RequestData,
  ) {
    try {
      const existing =
        await this.apiTransactionLogsService.findLatestByServiceEndpointAndCallerId(
          'TRACKWIZZ_AML',
          'AS504/response',
          duplicateKey,
          'success',
        );

      if (!existing?.responseData) {
        return null;
      }

      const stored = JSON.parse(existing.responseData);
      const normalized = stored?.normalized || stored;
      if (!normalized?.data) {
        return null;
      }

      if (
        !this.isMatchingAs504Duplicate(
          existing,
          normalized.data,
          requestData,
        )
      ) {
        return null;
      }

      return this.createAs504PublicResponse({
        provider: 'TRACKWIZZ',
        message:
          'TrackWizz AML screening already exists for this partner and LAN',
        data: {
          ...normalized.data,
          hitResponse: Array.isArray(normalized.data.hitResponse)
            ? normalized.data.hitResponse
            : [],
          duplicate: true,
          duplicateLogId: existing.id,
          duplicateScreenedAt: existing.createdAt,
        },
      });
    } catch (error) {
      this.logger.warn(
        `TrackWizz AS504 duplicate lookup failed: ${error.message}`,
      );
      return null;
    }
  }

  private isMatchingAs504Duplicate(
    existing: any,
    normalizedData: Record<string, any>,
    requestData: TrackwizzAs504RequestData,
  ): boolean {
    const requestPayload = this.parseJsonObject(existing?.requestPayload);
    const storedLan =
      this.cleanScalar(requestPayload?.lan) ||
      this.cleanScalar(normalizedData?.lan) ||
      this.extractAs504Lan(normalizedData?.raw);
    const storedCustomerCode =
      this.cleanScalar(requestPayload?.customerCode) ||
      this.cleanScalar(normalizedData?.customerCode) ||
      this.extractAs504CustomerCode(normalizedData?.raw);

    if (storedLan && storedLan !== requestData.lan) {
      return false;
    }

    if (storedCustomerCode && storedCustomerCode !== requestData.customerCode) {
      return false;
    }

    return (
      (!!storedLan && !!storedCustomerCode) ||
      existing?.callerId === this.createAs504DuplicateKey(requestData)
    );
  }

  private parseJsonObject(value: string): Record<string, any> {
    if (!value) {
      return {};
    }

    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  private extractAs504Lan(value: any): string {
    const customer = this.firstFrom(
      this.findFirstValue(value, ['customerResponse', 'CustomerResponse']),
    );

    return this.cleanScalar(
      this.findFirstValue(customer || value, [
        'uniqueIdentifier',
        'UniqueIdentifier',
      ]),
    );
  }

  private extractAs504CustomerCode(value: any): string {
    const customer = this.firstFrom(
      this.findFirstValue(value, ['customerResponse', 'CustomerResponse']),
    );

    return this.cleanScalar(
      this.findFirstValue(customer || value, [
        'sourceSystemCustomerCode',
        'SourceSystemCustomerCode',
      ]),
    );
  }

  private async logTrackwizzAudit(input: {
    callerId: string;
    endpoint: string;
    requestPayload?: any;
    responseData?: any;
    status: 'success' | 'error' | 'pending';
    durationMs?: number;
  }) {
    try {
      await this.apiTransactionLogsService.logTransaction({
        authType: 'api-key',
        callerId: input.callerId,
        service: 'TRACKWIZZ_AML',
        endpoint: input.endpoint,
        requestPayload:
          input.requestPayload == null
            ? undefined
            : JSON.stringify(this.redactSensitive(input.requestPayload)),
        responseData:
          input.responseData == null
            ? undefined
            : JSON.stringify(
                this.withoutLargeAs504Fields(
                  this.redactSensitive(input.responseData),
                ),
              ),
        status: input.status,
        durationMs: input.durationMs,
      });
    } catch (error) {
      this.logger.error(`TrackWizz audit log failed: ${error.message}`);
    }
  }

  private async logSeparatedAs504Artifacts(
    duplicateKey: string,
    requestId: string,
    normalizedData: Record<string, any>,
    auditPaths: TrackwizzAuditPaths,
    durationMs: number,
  ) {
    if (auditPaths.hitDetailsPath) {
      await this.logTrackwizzAudit({
        callerId: duplicateKey,
        endpoint: 'AS504/hits',
        requestPayload: { requestId },
        responseData: {
          requestId,
          hitDetailsPath: auditPaths.hitDetailsPath,
          hitsCount: normalizedData.hitsCount,
        },
        status: 'success',
        durationMs,
      });
    }

    if (auditPaths.reportPath) {
      await this.logTrackwizzAudit({
        callerId: duplicateKey,
        endpoint: 'AS504/report',
        requestPayload: { requestId },
        responseData: {
          requestId,
          reportPath: auditPaths.reportPath,
          hasReport: true,
        },
        status: 'success',
        durationMs,
      });
    }
  }

  private writeAs504ResponseArtifacts(
    requestId: string,
    rawResponse: any,
    normalizedData: Record<string, any>,
  ): TrackwizzAuditPaths {
    const paths: TrackwizzAuditPaths = {
      responsePayloadPath: this.writeAuditJson('responses', requestId, {
        rawResponse: this.withoutLargeAs504Fields(
          this.redactSensitive(rawResponse),
        ),
        normalized: this.withoutLargeAs504Fields(
          this.redactSensitive(normalizedData),
        ),
      }),
    };
    const hitResponse = this.arrayFrom(normalizedData.hitResponse);
    const reportData =
      this.cleanScalar(normalizedData.reportData) ||
      this.extractAs504ReportData(rawResponse);

    if (hitResponse.length) {
      paths.hitDetailsPath = this.writeAuditJson(
        'hits',
        requestId,
        hitResponse,
      );
    }

    if (reportData) {
      paths.reportPath = this.writeAuditPdf('reports', requestId, reportData);
    }

    return paths;
  }

  private writeAuditJson(kind: string, requestId: string, value: any): string {
    const filePath = this.auditFilePath(kind, requestId, 'json');
    writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
    return this.relativeAuditPath(filePath);
  }

  private writeAuditPdf(
    kind: string,
    requestId: string,
    reportData: string,
  ): string {
    const filePath = this.auditFilePath(kind, requestId, 'pdf');
    const base64 = reportData
      .replace(/^data:application\/pdf;base64,/i, '')
      .replace(/\s+/g, '');

    writeFileSync(filePath, Buffer.from(base64, 'base64'));
    return this.relativeAuditPath(filePath);
  }

  private auditFilePath(kind: string, requestId: string, extension: string) {
    const dirPath = path.resolve(process.cwd(), this.auditBasePath, kind);
    mkdirSync(dirPath, { recursive: true });

    return path.join(dirPath, `${this.safeFileName(requestId)}.${extension}`);
  }

  private relativeAuditPath(filePath: string): string {
    return path.relative(process.cwd(), filePath).replace(/\\/g, '/');
  }

  private isPathInside(parentPath: string, childPath: string): boolean {
    const relativePath = path.relative(parentPath, childPath);

    return !!relativePath && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
  }

  private safeFileName(value: string): string {
    return (this.clean(value) || `${Date.now()}`)
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 180);
  }

  private createAs504Payload(data: TrackwizzAs504RequestData) {
    if (data.rawPayload?.customerList?.length) {
      const payload = this.clonePlain(data.rawPayload);
      const originalCustomer = payload.customerList[0] || {};

      payload.requestId = data.requestId;
      payload.sourceSystemName = this.defaultSourceSystemName;
      payload.purpose = '01';
      payload.customerList[0] = {
        ...originalCustomer,
        status: originalCustomer.status || 'Active',
        countryofEducation: originalCustomer.countryofEducation || 'IND',
        CountryOfEmployment: originalCustomer.CountryOfEmployment || 'IND',
        kycAttestationType: originalCustomer.kycAttestationType || '1',
        kycPlaceOfDeclaration:
          originalCustomer.kycPlaceOfDeclaration || 'Mumbai',
        applicationRefNumber: data.applicationRefNumber,
        relatedPersonCountforCKYC:
          originalCustomer.relatedPersonCountforCKYC ?? 1,
        proofOfIdSubmitted: data.pan ? 'PAN' : '',
        products: originalCustomer.products || 'Loan',
        natureOfBusiness: originalCustomer.natureOfBusiness || 'Oth',
        educationalQualification:
          originalCustomer.educationalQualification || '1',
        countryOfOperations: originalCustomer.countryOfOperations || 'IND',
        personalMobileISD: '91',
        personalMobileNumber: data.mobile,
        workMobileISD: originalCustomer.workMobileISD || '91',
        regAMLRiskSpecialCategoryDtoList:
          originalCustomer.regAMLRiskSpecialCategoryDtoList || [],
        relatedPersonList: originalCustomer.relatedPersonList || [],
        customerRelationDtoList:
          originalCustomer.customerRelationDtoList || [],
        constitutionType: originalCustomer.constitutionType || '1',
        constitutionTypeId: originalCustomer.constitutionTypeId ?? 0,
        sourceSystemName: this.defaultSourceSystemName,
        sourceSystemCustomerCode: data.customerCode,
        sourceSystemCustomerCreationDate: data.createdAt,
        uniqueIdentifier: data.lan,
        prefix: originalCustomer.prefix || '',
        firstName: data.fullName,
        middleName: originalCustomer.middleName || '',
        lastName: originalCustomer.lastName || '',
        fatherPrefix: data.fatherName ? 'Mr' : '',
        fatherFirstName: data.fatherName,
        gender: data.gender,
        dateofBirth: data.dob,
        personalEmail: data.email,
        permanentAddressDistrict:
          originalCustomer.permanentAddressDistrict || '.',
        permanentAddressCity: originalCustomer.permanentAddressCity || '.',
        correspondenceAddressDistrict:
          originalCustomer.correspondenceAddressDistrict || '.',
        correspondenceAddressCity:
          originalCustomer.correspondenceAddressCity || '.',
        formSixty: data.pan ? '0' : '1',
        pan: data.pan,
        screeningReportWhenNil:
          originalCustomer.screeningReportWhenNil || '1',
        adverseReputation: originalCustomer.adverseReputation || '',
        taxDetailDtoList: originalCustomer.taxDetailDtoList || [
          {
            Id: 0,
            taxResidencyCountry: 'IND',
            taxIdentificationNumber: '',
            taxResidencyStartDate: '',
            taxResidencyEndDate: '',
          },
        ],
        gstinDtoList: originalCustomer.gstinDtoList || [
          {
            Id: 0,
            gstinNumber: '',
            GSTINStartDate: '',
            GSTINEndDate: '',
          },
        ],
        citizenships: originalCustomer.citizenships || 'IND',
        documents:
          Object.prototype.hasOwnProperty.call(originalCustomer, 'documents')
            ? originalCustomer.documents
            : null,
      };

      return payload;
    }

    return {
      requestId: data.requestId,
      sourceSystemName: this.defaultSourceSystemName,
      purpose: '01',
      customerList: [
        {
          status: 'Active',
          countryofEducation: 'IND',
          CountryOfEmployment: 'IND',
          kycAttestationType: '1',
          kycPlaceOfDeclaration: 'Mumbai',
          applicationRefNumber: data.applicationRefNumber,
          relatedPersonCountforCKYC: 1,
          proofOfIdSubmitted: data.pan ? 'PAN' : '',
          products: 'Loan',
          natureOfBusiness: 'Oth',
          educationalQualification: '1',
          countryOfOperations: 'IND',
          personalMobileISD: '91',
          personalMobileNumber: data.mobile,
          workMobileISD: '91',
          regAMLRiskSpecialCategoryDtoList: [],
          relatedPersonList: [],
          customerRelationDtoList: [],
          constitutionType: '1',
          constitutionTypeId: 0,
          sourceSystemName: this.defaultSourceSystemName,
          sourceSystemCustomerCode: data.customerCode,
          sourceSystemCustomerCreationDate: data.createdAt,
          uniqueIdentifier: data.lan,
          prefix: '',
          firstName: data.fullName,
          middleName: '',
          lastName: '',
          fatherPrefix: data.fatherName ? 'Mr' : '',
          fatherFirstName: data.fatherName,
          gender: data.gender,
          dateofBirth: data.dob,
          personalEmail: data.email,
          permanentAddressDistrict: '.',
          permanentAddressCity: '.',
          correspondenceAddressDistrict: '.',
          correspondenceAddressCity: '.',
          formSixty: data.pan ? '0' : '1',
          pan: data.pan,
          screeningReportWhenNil: '1',
          adverseReputation: '',
          taxDetailDtoList: [
            {
              Id: 0,
              taxResidencyCountry: 'IND',
              taxIdentificationNumber: '',
              taxResidencyStartDate: '',
              taxResidencyEndDate: '',
            },
          ],
          gstinDtoList: [
            {
              Id: 0,
              gstinNumber: '',
              GSTINStartDate: '',
              GSTINEndDate: '',
            },
          ],
          citizenships: 'IND',
          documents: null,
        },
      ],
    };
  }

  private clonePlain<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
  }

  private createAs504NormalizedResponse(
    rawResponse: any,
    fallbackRequestId: string,
    httpStatus?: number,
  ) {
    this.logger.debug(
      `TrackWizz AS504 raw response ${
        typeof rawResponse === 'string'
          ? rawResponse
          : JSON.stringify(rawResponse)
      }`,
    );

    const parsed = this.parseProviderPayload(rawResponse);
    const customerResponse = this.firstFrom(
      this.findFirstValue(parsed, [
        'customerResponse',
        'CustomerResponse',
        'customerResponses',
        'CustomerResponses',
      ]),
    );
    const purposeResponse = this.findAs504PurposeResponse(
      customerResponse || parsed,
    );
    const purposeData =
      purposeResponse?.data ||
      purposeResponse?.Data ||
      purposeResponse?.responseData ||
      purposeResponse?.ResponseData ||
      purposeResponse ||
      {};
    const overallStatus = this.cleanScalar(
      this.findFirstValue(parsed, ['overallStatus', 'OverallStatus']),
    );
    const validationOutcome = this.cleanScalar(
      this.findFirstValue(customerResponse || parsed, [
        'validationOutcome',
        'ValidationOutcome',
      ]),
    );
    const validationCode = this.cleanScalar(
      this.findFirstValue(customerResponse || parsed, [
        'validationCode',
        'ValidationCode',
      ]),
    );
    const validationDescription = this.cleanScalar(
      this.findFirstValue(customerResponse || parsed, [
        'validationDescription',
        'ValidationDescription',
        'message',
        'Message',
      ]),
    );
    const suggestedAction = this.cleanScalar(
      this.findFirstValue(purposeData, ['suggestedAction', 'SuggestedAction']),
    );
    const hitsDetected = this.optionalBoolean(
      this.findFirstValue(purposeData, ['hitsDetected', 'HitsDetected']),
    );
    const hitsCount = this.optionalNumber(
      this.findFirstValue(purposeData, ['hitsCount', 'HitsCount']),
    );
    const confirmedHits = this.cleanScalar(
      this.findFirstValue(purposeData, ['confirmedHits', 'ConfirmedHits']),
    );
    const reportData = this.cleanScalar(
      this.findFirstValue(purposeData, ['reportData', 'ReportData']),
    );
    const hitResponse = this.arrayFrom(
      this.findFirstValue(purposeData, [
        'hitResponse',
        'HitResponse',
        'hitResponses',
        'HitResponses',
      ]),
    ).map((hit) => this.redactSensitive(hit));
    const validationFailed =
      this.isAs504ValidationFailure(validationOutcome) ||
      (validationCode && validationCode !== 'MRV0') ||
      this.isAs504FailureStatus(overallStatus);
    const decision = validationFailed
      ? 'ERROR'
      : this.mapAs504SuggestedAction(suggestedAction);
    const message = this.clean(
      this.findFirstValue(purposeData, [
        'Message',
        'message',
        'RejectionMessage',
        'rejectionMessage',
        'StatusMessage',
        'statusMessage',
      ]),
    );
    const matched =
      hitsDetected === true ||
      (typeof hitsCount === 'number' && hitsCount > 0) ||
      hitResponse.length > 0;

    const data: Record<string, any> = {
      provider: 'TRACKWIZZ',
      api: 'AS504',
      requestId:
        this.cleanScalar(
          this.findFirstValue(parsed, ['requestId', 'RequestId']),
        ) || fallbackRequestId,
      httpStatus,
      overallStatus,
      validationOutcome,
      validationCode,
      validationDescription,
      sourceSystemCustomerCode: this.cleanScalar(
        this.findFirstValue(customerResponse, [
          'sourceSystemCustomerCode',
          'SourceSystemCustomerCode',
        ]),
      ),
      applicationRefNumber: this.cleanScalar(
        this.findFirstValue(customerResponse, [
          'applicationRefNumber',
          'ApplicationRefNumber',
        ]),
      ),
      purposeCode:
        this.cleanScalar(
          this.findFirstValue(purposeResponse, ['purposeCode', 'PurposeCode']),
        ) || '01',
      suggestedAction,
      profileCode: this.cleanScalar(
        this.findFirstValue(purposeData, ['profileCode', 'ProfileCode']),
      ),
      decision,
      screeningStatus: decision,
      verified: decision === 'PROCEED',
      matched,
      hitsDetected,
      hitsCount,
      confirmedHits,
      caseId: this.cleanScalar(
        this.findFirstValue(purposeData, ['caseId', 'CaseId', 'caseID']),
      ),
      caseUrl: this.cleanScalar(
        this.findFirstValue(purposeData, ['caseUrl', 'CaseUrl', 'caseURL']),
      ),
      hasReport: !!reportData,
      hitResponse,
      sourceSystemName: this.defaultSourceSystemName,
      cluster: this.cluster,
      raw: this.withoutLargeAs504Fields(this.redactSensitive(parsed)),
    };

    if (this.includeReportDataInResponse && reportData) {
      data.reportData = reportData;
    }

    return {
      provider: 'TRACKWIZZ',
      message: message || this.messageForAs504Decision(decision),
      data,
    };
  }

  private createAs504PublicResponse(normalized: any) {
    const data = normalized?.data || {};

    return {
      provider: 'TRACKWIZZ',
      message: normalized?.message || this.messageForAs504Decision(data.decision),
      data: {
        requestId: data.requestId,
        decision: data.decision,
        screeningStatus: data.screeningStatus,
        suggestedAction: data.suggestedAction,
        verified: data.verified,
        matched: data.matched,
        hitsDetected: data.hitsDetected,
        hitsCount: data.hitsCount,
        confirmedHits: data.confirmedHits,
        caseId: data.caseId,
        caseUrl: data.caseUrl,
        hasReport: data.hasReport,
        reportUrl: this.createAs504ReportUrl(data),
        reportPath: data.audit?.reportPath,
        hitResponse: data.hitResponse || [],
        duplicate: data.duplicate === true,
      },
    };
  }

  private createAs504ReportUrl(data: Record<string, any>): string {
    if (!data?.hasReport || !data?.requestId) {
      return '';
    }

    return `/aml/trackwizz/report/${encodeURIComponent(data.requestId)}`;
  }

  private findAs504PurposeResponse(customerResponse: any) {
    const purposeResponses = this.arrayFrom(
      this.findFirstValue(customerResponse, [
        'purposeResponse',
        'PurposeResponse',
        'purposeResponses',
        'PurposeResponses',
        'purposeResponseList',
        'PurposeResponseList',
      ]),
    );

    return (
      purposeResponses.find(
        (purposeResponse) =>
          this.cleanScalar(
            this.findFirstValue(purposeResponse, [
              'purposeCode',
              'PurposeCode',
            ]),
          ) === '01',
      ) ||
      purposeResponses[0] ||
      {}
    );
  }

  private createAs504TransportFailureResponse(
    fallbackRequestId: string,
    httpStatus: number,
    rawResponse: any,
  ) {
    const decision = this.transportFailureDecision();

    return {
      provider: 'TRACKWIZZ',
      message: this.messageForAs504Decision(decision, true),
      data: {
        provider: 'TRACKWIZZ',
        api: 'AS504',
        requestId: fallbackRequestId,
        httpStatus,
        decision,
        screeningStatus: 'TRANSPORT_ERROR',
        verified: false,
        matched: false,
        transportFailure: true,
        hitsDetected: null,
        hitsCount: null,
        confirmedHits: null,
        hasReport: false,
        hitResponse: [],
        sourceSystemName: this.defaultSourceSystemName,
        cluster: this.cluster,
        raw: this.withoutLargeAs504Fields(this.redactSensitive(rawResponse)),
      },
    };
  }

  private createAs504TransportErrorResponse(
    fallbackRequestId: string,
    error: any,
  ) {
    const decision = this.transportFailureDecision();
    const status = error?.response?.status || HttpStatus.BAD_GATEWAY;

    return {
      provider: 'TRACKWIZZ',
      message: this.messageForAs504Decision(decision, true),
      data: {
        provider: 'TRACKWIZZ',
        api: 'AS504',
        requestId: fallbackRequestId,
        httpStatus: status,
        decision,
        screeningStatus: 'TRANSPORT_ERROR',
        verified: false,
        matched: false,
        transportFailure: true,
        errorCode: this.cleanScalar(error?.code),
        errorMessage: this.cleanScalar(error?.message),
        hitsDetected: null,
        hitsCount: null,
        confirmedHits: null,
        hasReport: false,
        hitResponse: [],
        sourceSystemName: this.defaultSourceSystemName,
        cluster: this.cluster,
      },
    };
  }

  private createTransportErrorAuditPayload(error: any) {
    return {
      code: this.cleanScalar(error?.code),
      message: this.cleanScalar(error?.message),
      status: error?.response?.status || null,
      response: this.withoutLargeAs504Fields(
        this.redactSensitive(this.parseProviderPayload(error?.response?.data)),
      ),
    };
  }

  private transportFailureDecision(): TrackwizzAs504Decision {
    return this.allowProceedOnTransportFailure ? 'PROCEED' : 'REVIEW';
  }

  private mapAs504SuggestedAction(
    suggestedAction: string,
  ): TrackwizzAs504Decision {
    const normalized = this.cleanScalar(suggestedAction).toLowerCase();

    if (normalized === 'proceed') {
      return 'PROCEED';
    }

    if (normalized === 'stop') {
      return 'STOP';
    }

    if (normalized === 'review') {
      return 'REVIEW';
    }

    return 'REVIEW';
  }

  private messageForAs504Decision(
    decision: TrackwizzAs504Decision,
    transportFailure = false,
  ): string {
    if (transportFailure) {
      return decision === 'PROCEED'
        ? 'TrackWizz AS504 failed; proceeding because fail-open is configured'
        : 'TrackWizz AS504 failed; manual review required';
    }

    if (decision === 'PROCEED') {
      return 'TrackWizz AML screening cleared';
    }

    if (decision === 'STOP') {
      return 'TrackWizz AML screening returned Stop';
    }

    if (decision === 'ERROR') {
      return 'TrackWizz AML validation failed';
    }

    return 'TrackWizz AML screening requires review';
  }

  private isAs504ValidationFailure(value: string): boolean {
    const normalized = this.cleanScalar(value).toLowerCase();
    if (!normalized) {
      return false;
    }

    return ![
      'success',
      'successful',
      'valid',
      'validated',
      'passed',
      'pass',
      'ok',
      'mrv0',
      'true',
    ].includes(normalized);
  }

  private isAs504FailureStatus(value: string): boolean {
    const normalized = this.cleanScalar(value).toLowerCase();
    return ['failed', 'failure', 'error', 'rejected'].includes(normalized);
  }

  private extractAs504ReportData(value: any): string {
    return this.cleanScalar(
      this.findFirstValue(value, ['reportData', 'ReportData']),
    );
  }

  private withoutLargeAs504Fields(value: any): any {
    if (Array.isArray(value)) {
      return value.map((item) => this.withoutLargeAs504Fields(item));
    }

    if (!value || typeof value !== 'object') {
      return value;
    }

    return Object.entries(value).reduce((result, [key, entry]) => {
      if (/reportdata/i.test(key)) {
        result[key] = '[PDF_STORED_SEPARATELY]';
        return result;
      }

      if (/hitresponse|hitresponses/i.test(key)) {
        result[key] = '[HITS_STORED_SEPARATELY]';
        return result;
      }

      result[key] = this.withoutLargeAs504Fields(entry);
      return result;
    }, {});
  }

  private firstFrom(value: any): any {
    return this.arrayFrom(value)[0] || null;
  }

  private arrayFrom(value: any): any[] {
    if (value == null || value === '') {
      return [];
    }

    return Array.isArray(value) ? value : [value];
  }

  private optionalNumber(value: any): number | null {
    const raw = this.cleanScalar(value);
    if (!raw) {
      return null;
    }

    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private optionalBoolean(value: any): boolean | null {
    const raw = this.cleanScalar(value).toLowerCase();
    if (!raw) {
      return null;
    }

    if (['true', 'yes', 'y', '1'].includes(raw)) {
      return true;
    }

    if (['false', 'no', 'n', '0'].includes(raw)) {
      return false;
    }

    return null;
  }

  private cleanScalar(value: any): string {
    if (value == null) {
      return '';
    }

    if (typeof value === 'string') {
      return value.trim();
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value).trim();
    }

    return '';
  }

  private createScreeningRequest(
    dto: TrackwizzAmlVerificationDto,
    requireParentCompany = false,
  ): TrackwizzScreeningRequestData {
    const name = this.clean(dto.fullName || dto.name);
    const parentCompany = this.clean(this.defaultParentCompany);
    const intermediaryCode = this.clean(this.defaultIntermediaryCode);
    const mobile = this.normalizeIndianMobile(dto.mobile);

    if (!name) {
      throw new BadRequestException('name is required for AML screening');
    }

    if (requireParentCompany && !parentCompany) {
      throw new BadRequestException(
        'parentCompany is required in the request or TRACKWIZZ_PARENT_COMPANY',
      );
    }

    return {
      RequestId: uuidv4(),
      RecordIdentifier: '',
      ApplicationRefNumber: this.clean(dto.applicationRefNumber),
      IntermediaryCode: intermediaryCode,
      SourceSystemName: this.clean(this.defaultSourceSystemName),
      ParentCompany: parentCompany,
      FirstName: name,
      MiddleName: '',
      LastName: '',
      CustomerCategory: 'IND',
      Gender: this.normalizeGender(dto.gender),
      Pan: this.normalizePan(dto.pan),
      Din: '',
      Cin: '',
      PassportNumber: '',
      DrivingLicenseNumber: '',
      DateOfBirth: this.formatTrackwizzDate(dto.dob, 'dob'),
      BirthCity: '',
      CountryOfBirth: '',
      Nationalities: [],
      CorrespondenceAddressLine1: '',
      CorrespondenceAddressLine2: '',
      CorrespondenceAddressLine3: '',
      CorrespondenceAddressCity: '',
      CorrespondenceAddressState: '',
      CorrespondenceAddressCountry: '',
      CorrespondenceAddressPinCode: '',
      PermanentAddressLine1: '',
      PermanentAddressLine2: '',
      PermanentAddressLine3: '',
      PermanentAddressCity: '',
      PermanentAddressState: '',
      PermanentAddressCountry: '',
      PermanentAddressPinCode: '',
      WorkMobileISD: '',
      WorkMobileNumber: '',
      PersonalMobileISD: mobile ? '91' : '',
      PersonalMobileNumber: mobile,
      WorkEmail: '',
      PersonalEmail: this.clean(dto.email),
      Tags: [],
      ProductSegments: [],
      ScreeningCategory: 'Initial Screening Master',
    };
  }

  private createRequestDataXml(data: TrackwizzScreeningRequestData): string {
    return [
      this.requestDataXmlDeclaration(),
      '<ScreeningRequestData xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
      this.tag('RequestId', data.RequestId),
      this.tag('RecordIdentifier', data.RecordIdentifier),
      this.tag('ApplicationRefNumber', data.ApplicationRefNumber),
      this.tag('IntermediaryCode', data.IntermediaryCode),
      this.tag('SourceSystemName', data.SourceSystemName),
      this.tag('ParentCompany', data.ParentCompany),
      this.tag('FirstName', data.FirstName),
      this.tag('MiddleName', data.MiddleName),
      this.tag('LastName', data.LastName),
      this.tag('CustomerCategory', data.CustomerCategory),
      this.tag('Gender', data.Gender),
      this.tag('Pan', data.Pan),
      this.tag('Din', data.Din),
      this.tag('Cin', data.Cin),
      this.tag('PassportNumber', data.PassportNumber),
      this.tag('DrivingLicenseNumber', data.DrivingLicenseNumber),
      this.tag('DateOfBirth', data.DateOfBirth),
      this.tag('BirthCity', data.BirthCity),
      this.tag('CountryOfBirth', data.CountryOfBirth),
      this.listTag('Nationalities', 'Nationality', data.Nationalities),
      this.tag(
        'CorrespondenceAddressLine1',
        data.CorrespondenceAddressLine1,
      ),
      this.tag(
        'CorrespondenceAddressLine2',
        data.CorrespondenceAddressLine2,
      ),
      this.tag(
        'CorrespondenceAddressLine3',
        data.CorrespondenceAddressLine3,
      ),
      this.tag('CorrespondenceAddressCity', data.CorrespondenceAddressCity),
      this.tag('CorrespondenceAddressState', data.CorrespondenceAddressState),
      this.tag(
        'CorrespondenceAddressCountry',
        data.CorrespondenceAddressCountry,
      ),
      this.tag(
        'CorrespondenceAddressPinCode',
        data.CorrespondenceAddressPinCode,
      ),
      this.tag('PermanentAddressLine1', data.PermanentAddressLine1),
      this.tag('PermanentAddressLine2', data.PermanentAddressLine2),
      this.tag('PermanentAddressLine3', data.PermanentAddressLine3),
      this.tag('PermanentAddressCity', data.PermanentAddressCity),
      this.tag('PermanentAddressState', data.PermanentAddressState),
      this.tag('PermanentAddressCountry', data.PermanentAddressCountry),
      this.tag('PermanentAddressPinCode', data.PermanentAddressPinCode),
      this.tag('WorkMobileISD', data.WorkMobileISD),
      this.tag('WorkMobileNumber', data.WorkMobileNumber),
      this.tag('PersonalMobileISD', data.PersonalMobileISD),
      this.tag('PersonalMobileNumber', data.PersonalMobileNumber),
      this.tag('WorkEmail', data.WorkEmail),
      this.tag('PersonalEmail', data.PersonalEmail),
      this.listTag('Tags', 'Tag', data.Tags),
      this.listTag(
        'ProductSegments',
        'ProductSegment',
        data.ProductSegments,
      ),
      this.tag('ScreeningCategory', data.ScreeningCategory),
      '</ScreeningRequestData>',
    ].join('');
  }

  private createEncryptedRequestXml(requestDataXml: string): string {
    const sessionKey = randomBytes(32);
    const encryptedRequestData = this.aesEncrypt(requestDataXml, sessionKey);
    const encryptedSessionKey = publicEncrypt(
      {
        key: this.loadPublicKey('TRACKWIZZ_ENCRYPTION_CERT'),
        padding: this.rsaPadding(),
      },
      sessionKey,
    ).toString('base64');

    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<A64EncryptedRequestModel xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
      this.tag('ApiToken', this.apiToken),
      this.tag('SessionKey', encryptedSessionKey),
      this.tag('RequestData', encryptedRequestData),
      '</A64EncryptedRequestModel>',
    ].join('');
  }

  private signXml(xml: string): string {
    const privateKey = this.loadPrivateKey();
    const signingCert = this.getSigningCertForKeyInfo();
    const signer = new SignedXml({
      privateKey,
      publicCert: signingCert || undefined,
      signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
      canonicalizationAlgorithm:
        'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
      getKeyInfoContent: signingCert ? undefined : () => null,
    });

    signer.addReference({
      xpath: "//*[local-name(.)='A64EncryptedRequestModel']",
      transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature'],
      digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
      isEmptyUri: true,
    });

    signer.computeSignature(xml, {
      location: {
        reference: "//*[local-name(.)='A64EncryptedRequestModel']",
        action: 'append',
      },
    });

    return signer.getSignedXml();
  }

  private createNormalizedResponse(
    responseXml: string,
    fallbackRequestId: string,
    includeReportData: boolean,
  ) {
    const xml = this.cleanXml(responseXml);
    const parsedEncryptedResponse = this.parseXml(xml);
    const encryptedModel =
      parsedEncryptedResponse.A64EncryptedResponseModel || parsedEncryptedResponse;

    if (this.isImmediateRejection(encryptedModel)) {
      const rejectionMessage =
        this.clean(encryptedModel.RejectionMessage) ||
        'TrackWizz AML screening rejected';

      return {
        provider: 'TRACKWIZZ',
        message: rejectionMessage,
        data: {
          provider: 'TRACKWIZZ',
          requestId: fallbackRequestId,
          screeningStatus: 'REJECTED',
          verified: false,
          matched: false,
          requestStatus: this.clean(encryptedModel.RequestStatus),
          rejectionCode: this.clean(encryptedModel.RejectionCode),
          rejectionMessage,
        },
      };
    }

    if (this.shouldVerifyResponseSignature) {
      this.verifyResponseSignature(xml);
    }

    const decryptedXml = this.decryptResponseData(encryptedModel);
    const parsedDecryptedResponse = this.parseXml(decryptedXml);
    const parsedResponse =
      parsedDecryptedResponse.A64ResponseModel || parsedDecryptedResponse;
    const screeningResults = parsedResponse.ScreeningResults || parsedResponse;
    const normalized = this.normalizeScreeningResults(
      screeningResults,
      fallbackRequestId,
      includeReportData,
    );

    return {
      provider: 'TRACKWIZZ',
      message: normalized.message,
      data: normalized.data,
    };
  }

  private decryptResponseData(encryptedModel: any): string {
    const encryptedSessionKey = this.base64Value(encryptedModel.SessionKey);
    const encryptedResponseData = this.base64Value(encryptedModel.ResponseData);

    if (!encryptedSessionKey || !encryptedResponseData) {
      throw new HttpException(
        'TrackWizz response did not include encrypted screening data',
        HttpStatus.BAD_GATEWAY,
      );
    }

    const sessionKey = privateDecrypt(
      {
        key: this.loadPrivateKey(),
        padding: this.rsaPadding(),
      },
      Buffer.from(encryptedSessionKey, 'base64'),
    );

    const decryptedBuffer = this.aesDecrypt(
      Buffer.from(encryptedResponseData, 'base64'),
      sessionKey,
    );

    return this.decodeXmlBuffer(decryptedBuffer);
  }

  private normalizeScreeningResults(
    screeningResults: any,
    fallbackRequestId: string,
    includeReportData: boolean,
  ) {
    const matchedValue = this.clean(screeningResults.Matched);
    const screeningStatus = this.screeningStatus(matchedValue);
    const reportData = this.clean(screeningResults.ReportData);
    const rejectionMessage = this.clean(screeningResults.RejectionMessage);
    const alerts = this.normalizeAlerts(screeningResults.Alerts?.Alert);
    const alertCount = Number(this.clean(screeningResults.AlertCount));
    const message =
      screeningStatus === 'NO_MATCH'
        ? 'No AML match found'
        : screeningStatus === 'MATCH'
          ? 'AML match found'
          : rejectionMessage || 'TrackWizz AML screening returned an error';

    const data: Record<string, any> = {
      provider: 'TRACKWIZZ',
      requestId: this.clean(screeningResults.RequestId) || fallbackRequestId,
      responseId: this.clean(screeningResults.ResponseId),
      screeningStatus,
      verified: screeningStatus === 'NO_MATCH',
      matched: screeningStatus === 'MATCH',
      matchedValue,
      alertCount: Number.isFinite(alertCount) ? alertCount : alerts.length,
      alerts,
      requestStatus: this.clean(screeningResults.RequestStatus),
      rejectionCode: this.clean(screeningResults.RejectionCode),
      rejectionMessage,
      hasReport: !!reportData,
      raw: this.sanitizeScreeningResults(screeningResults),
    };

    if (includeReportData && reportData) {
      data.reportData = reportData;
    }

    return { message, data };
  }

  private verifyResponseSignature(xml: string) {
    const document = new DOMParser().parseFromString(xml, 'application/xml');
    const signatureNode =
      document.getElementsByTagNameNS(
        'http://www.w3.org/2000/09/xmldsig#',
        'Signature',
      )[0] || document.getElementsByTagName('Signature')[0];

    if (!signatureNode) {
      throw new HttpException(
        'TrackWizz response signature missing',
        HttpStatus.BAD_GATEWAY,
      );
    }

    const verifier = new SignedXml({
      publicCert: this.loadPublicKey('TRACKWIZZ_ENCRYPTION_CERT'),
      getCertFromKeyInfo: () => null,
    });

    verifier.loadSignature(signatureNode as any);

    if (!verifier.checkSignature(xml)) {
      throw new HttpException(
        'TrackWizz response signature verification failed',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  private aesEncrypt(value: string, sessionKey: Buffer): string {
    const cipher = createCipheriv(
      this.aesAlgorithm,
      sessionKey,
      this.aesIv(),
    );
    const payload = Buffer.from(value, this.xmlEncoding);
    return Buffer.concat([cipher.update(payload), cipher.final()]).toString(
      'base64',
    );
  }

  private aesDecrypt(value: Buffer, sessionKey: Buffer): Buffer {
    const decipher = createDecipheriv(
      this.aesAlgorithm,
      sessionKey,
      this.aesIv(),
    );
    return Buffer.concat([decipher.update(value), decipher.final()]);
  }

  private aesIv(): Buffer | null {
    if (this.aesAlgorithm.toLowerCase().includes('ecb')) {
      return null;
    }

    const base64Iv = this.config.get<string>('TRACKWIZZ_AES_IV_BASE64', '');
    if (base64Iv) {
      return Buffer.from(base64Iv, 'base64');
    }

    const hexIv = this.config.get<string>('TRACKWIZZ_AES_IV_HEX', '');
    if (hexIv) {
      return Buffer.from(hexIv, 'hex');
    }

    return Buffer.alloc(16);
  }

  private rsaPadding() {
    const padding = this.config
      .get<string>('TRACKWIZZ_RSA_PADDING', 'pkcs1')
      .toLowerCase();

    return padding === 'oaep'
      ? constants.RSA_PKCS1_OAEP_PADDING
      : constants.RSA_PKCS1_PADDING;
  }

  private loadPublicKey(prefix: string): KeyObject {
    const material = this.getRequiredKeyMaterial(prefix);

    try {
      return createPublicKey(material);
    } catch {
      try {
        return new X509Certificate(material).publicKey;
      } catch (error) {
        throw new InternalServerErrorException(
          `${prefix} must be a valid PEM public key/certificate or DER certificate`,
        );
      }
    }
  }

  private loadPrivateKey(): KeyObject {
    const material = this.getRequiredKeyMaterial('TRACKWIZZ_PRIVATE_KEY');

    try {
      return createPrivateKey({
        key: material,
        passphrase: this.privateKeyPassphrase || undefined,
      });
    } catch (error) {
      throw new InternalServerErrorException(
        'TRACKWIZZ_PRIVATE_KEY must be a PEM private key. Convert PFX/P12 certificates to PEM before configuring this Node service.',
      );
    }
  }

  private getRequiredKeyMaterial(prefix: string): KeyMaterial {
    const material = this.getOptionalKeyMaterial(prefix);

    if (!material) {
      throw new InternalServerErrorException(
        `${prefix}, ${prefix}_BASE64 or ${prefix}_PATH is required`,
      );
    }

    return material;
  }

  private getSigningCertForKeyInfo(): string | null {
    const material = this.getOptionalKeyMaterial('TRACKWIZZ_SIGNING_CERT');
    if (!material) {
      return null;
    }

    if (typeof material === 'string' && material.includes('-----BEGIN')) {
      return material;
    }

    try {
      return new X509Certificate(material).toString();
    } catch {
      return typeof material === 'string' ? material : material.toString('utf8');
    }
  }

  private getOptionalKeyMaterial(prefix: string): KeyMaterial | null {
    const direct = this.config.get<string>(prefix, '').trim();
    if (direct) {
      return this.normalizePemText(direct);
    }

    const base64 = this.config.get<string>(`${prefix}_BASE64`, '').trim();
    if (base64) {
      const decoded = Buffer.from(base64, 'base64');
      const text = decoded.toString('utf8');
      return text.includes('-----BEGIN') ? this.normalizePemText(text) : decoded;
    }

    const filePath = this.config.get<string>(`${prefix}_PATH`, '').trim();
    if (filePath) {
      return readFileSync(path.resolve(process.cwd(), filePath));
    }

    return null;
  }

  private hasKeyMaterial(prefix: string): boolean {
    return !!(
      this.config.get<string>(prefix, '').trim() ||
      this.config.get<string>(`${prefix}_BASE64`, '').trim() ||
      this.config.get<string>(`${prefix}_PATH`, '').trim()
    );
  }

  private hasClientCertificate(): boolean {
    return (
      this.hasKeyMaterial('TW_CLIENT_PFX') ||
      this.hasKeyMaterial('TW_PFX') ||
      this.hasKeyMaterial('TRACKWIZZ_CLIENT_PFX') ||
      this.hasKeyMaterial('TW_CLIENT_CERT') ||
      this.hasKeyMaterial('TW_CERT') ||
      this.hasKeyMaterial('TRACKWIZZ_CLIENT_CERT')
    );
  }

  private parseXml(xml: string): any {
    try {
      return this.xmlParser.parse(xml);
    } catch (error) {
      throw new HttpException(
        'TrackWizz returned malformed XML',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  private normalizeAlerts(alertOrAlerts: any): any[] {
    if (!alertOrAlerts) {
      return [];
    }

    const alerts = Array.isArray(alertOrAlerts) ? alertOrAlerts : [alertOrAlerts];

    return alerts.map((alert) => ({
      srNo: this.clean(alert.SrNo),
      source: this.clean(alert.Source),
      sourceUniqueId: this.clean(alert.SourceUniqueId),
      trackwizzId: this.clean(alert.TrackwizzId),
      primaryMatch: this.clean(alert.PrimaryMatch),
      matchType: this.clean(alert.MatchType),
      score: this.clean(alert.Score),
    }));
  }

  private sanitizeScreeningResults(screeningResults: any) {
    const { ApiToken, ReportData, ...safeResults } = screeningResults || {};
    return safeResults;
  }

  private screeningStatus(matchedValue: string): string {
    const normalized = matchedValue.toLowerCase();

    if (['match', 'matched', 'true', 'yes', 'confirmed'].includes(normalized)) {
      return 'MATCH';
    }

    if (
      ['not match', 'no match', 'not matched', 'false', 'no', 'clear'].includes(
        normalized,
      )
    ) {
      return 'NO_MATCH';
    }

    if (
      ['error', 'failed', 'failure', 'rejected', 'rejected by tw'].includes(
        normalized,
      )
    ) {
      return 'ERROR';
    }

    return 'UNKNOWN';
  }

  private isImmediateRejection(model: any): boolean {
    return (
      this.clean(model?.RequestStatus).toLowerCase() === 'rejected by tw' &&
      !this.clean(model?.ResponseData)
    );
  }

  private decodeXmlBuffer(buffer: Buffer): string {
    if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
      return buffer.subarray(2).toString('utf16le');
    }

    const sampleLength = Math.min(buffer.length, 80);
    let nullOddBytes = 0;

    for (let index = 1; index < sampleLength; index += 2) {
      if (buffer[index] === 0) {
        nullOddBytes += 1;
      }
    }

    if (nullOddBytes > sampleLength / 4) {
      return buffer.toString('utf16le').replace(/^\uFEFF/, '');
    }

    return buffer.toString('utf8').replace(/^\uFEFF/, '');
  }

  private cleanXml(xml: string): string {
    return typeof xml === 'string' ? xml.trim() : String(xml || '').trim();
  }

  private base64Value(value: string): string {
    return this.clean(value).replace(/\s+/g, '');
  }

  private clean(value?: string): string {
    return String(value ?? '').trim();
  }

  private cleanList(values?: string[], uppercase = false): string[] {
    return (values || [])
      .map((value) => this.clean(value))
      .filter(Boolean)
      .map((value) => (uppercase ? value.toUpperCase() : value));
  }

  private normalizePan(value?: string): string {
    const pan = this.clean(value).toUpperCase();
    if (!pan) {
      return '';
    }

    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) {
      throw new BadRequestException('Invalid PAN format');
    }

    return pan;
  }

  private normalizeIndianMobile(value?: string): string {
    const raw = this.clean(value);
    if (!raw) {
      return '';
    }

    const digits = raw.replace(/\D/g, '');
    const candidates: string[] = [];

    for (let index = 0; index <= digits.length - 10; index += 1) {
      const candidate = digits.slice(index, index + 10);
      if (/^[6-9][0-9]{9}$/.test(candidate)) {
        candidates.push(candidate);
      }
    }

    if (!candidates.length) {
      throw new BadRequestException(
        'mobile must contain a valid Indian 10-digit number starting with 6-9',
      );
    }

    return candidates[candidates.length - 1];
  }

  private normalizeGender(value?: string): string {
    const gender = this.clean(value).toLowerCase();
    if (!gender) {
      return '';
    }

    if (['01', 'male', 'm'].includes(gender)) {
      return '01';
    }

    if (['02', 'female', 'f'].includes(gender)) {
      return '02';
    }

    if (['03', 'transgender', 'trans', 't'].includes(gender)) {
      return '03';
    }

    throw new BadRequestException(
      'gender must be 01/02/03, male, female, or transgender',
    );
  }

  private todayTrackwizzDate(): string {
    const now = new Date();
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];

    return `${String(now.getDate()).padStart(2, '0')}-${months[now.getMonth()]}-${now.getFullYear()}`;
  }

  private formatTrackwizzDate(value?: string, fieldName = 'date'): string {
    const raw = this.clean(value);
    if (!raw) {
      return '';
    }

    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    let day = '';
    let month = '';
    let year = '';
    const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      [, year, month, day] = isoMatch;
    } else {
      const dmyMatch = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
      if (dmyMatch) {
        [, day, month, year] = dmyMatch;
      } else {
        const twMatch = raw.match(/^(\d{2})-([a-zA-Z]{3})-(\d{4})$/);
        if (twMatch) {
          [, day, month, year] = twMatch;
        }
      }
    }

    const monthIndex = /^[0-9]{2}$/.test(month)
      ? Number(month) - 1
      : months.findIndex(
          (monthName) => monthName.toLowerCase() === month.toLowerCase(),
        );

    if (!day || !year || monthIndex < 0 || !months[monthIndex]) {
      throw new BadRequestException(
        `${fieldName} must be in DD-MMM-YYYY format`,
      );
    }

    const dayNumber = Number(day);
    const yearNumber = Number(year);
    const date = new Date(Date.UTC(yearNumber, monthIndex, dayNumber));

    if (
      date.getUTCFullYear() !== yearNumber ||
      date.getUTCMonth() !== monthIndex ||
      date.getUTCDate() !== dayNumber
    ) {
      throw new BadRequestException(`${fieldName} is invalid`);
    }

    return `${day.padStart(2, '0')}-${months[monthIndex]}-${year}`;
  }

  private listTag(rootTag: string, itemTag: string, values: string[]): string {
    if (!values.length) {
      return `<${rootTag}></${rootTag}>`;
    }

    return `<${rootTag}>${values
      .map((value) => this.tag(itemTag, value))
      .join('')}</${rootTag}>`;
  }

  private tag(name: string, value: string): string {
    const cleanValue = this.clean(value);
    if (!cleanValue) {
      return `<${name} />`;
    }

    return `<${name}>${this.escapeXml(cleanValue)}</${name}>`;
  }

  private escapeXml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private parseProviderPayload(value: any): any {
    if (typeof value !== 'string') {
      return value;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    try {
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        return JSON.parse(trimmed);
      }

      if (trimmed.startsWith('<')) {
        return this.xmlParser.parse(trimmed);
      }
    } catch {
      return trimmed;
    }

    return trimmed;
  }

  private responseResultRoot(value: any): any {
    return (
      value?.ScreeningResults ||
      value?.A64ResponseModel?.ScreeningResults ||
      value?.data?.model ||
      value?.Data?.Model ||
      value?.model ||
      value?.Model ||
      value?.data ||
      value?.Data ||
      value?.result ||
      value?.Result ||
      value
    );
  }

  private findFirstValue(value: any, keys: string[], depth = 0): any {
    if (value == null || depth > 6) {
      return undefined;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = this.findFirstValue(item, keys, depth + 1);
        if (found != null && found !== '') {
          return found;
        }
      }

      return undefined;
    }

    if (typeof value !== 'object') {
      return undefined;
    }

    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        return value[key];
      }
    }

    for (const child of Object.values(value)) {
      const found = this.findFirstValue(child, keys, depth + 1);
      if (found != null && found !== '') {
        return found;
      }
    }

    return undefined;
  }

  private messageForStatus(screeningStatus: string): string {
    if (screeningStatus === 'MATCH') {
      return 'AML match found';
    }

    if (screeningStatus === 'NO_MATCH') {
      return 'No AML match found';
    }

    if (screeningStatus === 'ERROR') {
      return 'TrackWizz AML screening returned an error';
    }

    return 'TrackWizz AML screening completed';
  }

  private trackwizzValidationStatus(
    validationCode: string,
    validationDescription: string,
  ): number {
    const text = `${validationCode} ${validationDescription}`.toLowerCase();

    if (text.includes('token')) {
      return HttpStatus.BAD_GATEWAY;
    }

    return HttpStatus.BAD_REQUEST;
  }

  private redactSensitive(value: any): any {
    if (Array.isArray(value)) {
      return value.map((item) => this.redactSensitive(item));
    }

    if (!value || typeof value !== 'object') {
      return value;
    }

    return Object.entries(value).reduce((result, [key, entry]) => {
      if (
        /token|authorization|password|secret|sessionkey|requestdata|responsedata/i.test(
          key,
        )
      ) {
        result[key] = '[REDACTED]';
        return result;
      }

      if (/reportdata/i.test(key)) {
        result[key] = '[BASE64_REPORT_REDACTED]';
        return result;
      }

      result[key] = this.redactSensitive(entry);
      return result;
    }, {});
  }

  private omitEmpty(value: any): any {
    if (Array.isArray(value)) {
      return value
        .map((item) => this.omitEmpty(item))
        .filter((item) => item != null && item !== '');
    }

    if (!value || typeof value !== 'object') {
      return value;
    }

    return Object.entries(value).reduce((result, [key, entry]) => {
      const cleaned = this.omitEmpty(entry);
      const shouldOmit =
        cleaned == null ||
        cleaned === '' ||
        (Array.isArray(cleaned) && cleaned.length === 0) ||
        (typeof cleaned === 'object' &&
          !Array.isArray(cleaned) &&
          Object.keys(cleaned).length === 0);

      if (!shouldOmit) {
        result[key] = cleaned;
      }

      return result;
    }, {});
  }

  private warnIfTokenLooksInvalid() {
    if (!this.apiToken.startsWith('eyJ')) {
      return;
    }

    const dotCount = (this.apiToken.match(/\./g) || []).length;
    const hasOnlyJwtCharacters = /^[A-Za-z0-9_.-]+$/.test(this.apiToken);

    if (dotCount !== 2 || !hasOnlyJwtCharacters) {
      this.logger.warn(
        'TW_API_TOKEN looks like an incomplete or malformed JWT. Paste the complete TrackWizz API token as a single line.',
      );
    }
  }

  private isProviderTimeoutOrAbort(error: any): boolean {
    const message = this.clean(error?.message).toLowerCase();
    const code = this.clean(error?.code).toUpperCase();

    return (
      code === 'ECONNABORTED' ||
      code === 'ETIMEDOUT' ||
      code === 'ERR_CANCELED' ||
      message.includes('timed out') ||
      message.includes('timeout') ||
      message.includes('stream has been aborted') ||
      message.includes('socket hang up')
    );
  }

  private isClientCertificateError(error: any): boolean {
    const message = this.clean(error?.message).toLowerCase();
    const code = this.clean(error?.code).toUpperCase();

    return (
      code.includes('CERT') ||
      code.includes('TLS') ||
      code.includes('SSL') ||
      message.includes('certificate required') ||
      message.includes('no credentials are available') ||
      message.includes('tls') ||
      message.includes('ssl')
    );
  }

  private positiveNumber(value: string, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private shouldUseProxy(): boolean {
    return this.configValue('TW_USE_PROXY', 'TRACKWIZZ_USE_PROXY') === 'true';
  }

  private envFlag(key: string, defaultValue: boolean): boolean {
    const value = this.configValue(key);
    if (!value) {
      return defaultValue;
    }

    return value.toLowerCase() === 'true';
  }

  private configValue(...keys: string[]): string {
    for (const key of keys) {
      const value = this.config.get<string>(key, '').trim();
      if (value) {
        return value;
      }
    }

    return '';
  }

  private urlValue(value: string): string {
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) ? value : '';
    } catch {
      return '';
    }
  }

  private domainHeaderValue(value: string): string {
    try {
      const url = new URL(value);
      return url.origin;
    } catch {
      return value;
    }
  }

  private normalizePemText(value: string): string {
    return value.replace(/\\n/g, '\n');
  }

  private requestDataXmlDeclaration(): string {
    return this.xmlEncoding === 'utf16le'
      ? '<?xml version="1.0" encoding="utf-16"?>'
      : '<?xml version="1.0" encoding="UTF-8"?>';
  }
}
