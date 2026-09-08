import { ServiceError } from '../types';

export const INITIAL_ERRORS: ServiceError[] = [
  {
    id: 'err-bill-001',
    serviceId: 'billing-engine',
    serviceName: 'Billing Engine',
    type: 'PaymentGatewayTimeoutException',
    message: 'Payment provider bank settlement gateway timed out after 5000ms threshold',
    statusCode: 504,
    occurrences: 780,
    firstSeen: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    lastSeen: new Date(Date.now() - 1000 * 10).toISOString(),
    affectedEndpoint: 'POST /api/v1/billing/invoices/generate',
    status: 'active',
    relatedTraceId: '7e2b-11ff-88cd-5542',
    stackTrace: `PaymentGatewayTimeoutException: Connection timeout during settlement negotiation
    at PaymentClient.postSettlement (src/billing/gateways/stripe.ts:182:14)
    at InvoiceDispatcher.generateAndCharge (src/billing/invoices.ts:94:10)
    at async handleInvoiceGeneration (src/server.ts:88:6)`,
  },
  {
    id: 'err-bill-002',
    serviceId: 'billing-engine',
    serviceName: 'Billing Engine',
    type: 'BankSettlementSFUException',
    message: 'Internal server 500 error when processing recurring card tokenization',
    statusCode: 500,
    occurrences: 460,
    firstSeen: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    lastSeen: new Date(Date.now() - 1000 * 30).toISOString(),
    affectedEndpoint: 'POST /api/v1/billing/subscriptions/renew',
    status: 'active',
    relatedTraceId: '3c19-bb77-4401-9988',
    stackTrace: `BankSettlementSFUException: Card vault returned 500 internal server error
    at CardVault.tokenize (src/billing/vault.ts:55:12)
    at SubscriptionEngine.renew (src/billing/renew.ts:120:8)`,
  },
  {
    id: 'err-001',
    serviceId: 'live-consult-service',
    serviceName: 'Live Consult Service',
    type: 'WebRTCSignalingTimeout',
    message: 'SFU Media Gateway ICE candidate negotiation timed out after 2000ms threshold',
    statusCode: 504,
    occurrences: 1180,
    firstSeen: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    lastSeen: new Date(Date.now() - 1000 * 5).toISOString(),
    affectedEndpoint: 'POST /api/v1/consultations/live/session-join',
    status: 'active',
    relatedTraceId: '8f3c-a9b1-42cd-99ef',
    stackTrace: `WebRTCSignalingTimeout: SFU WebRTC media bridge handshake timed out after 2000ms
    at SFUMediaGateway.negotiateICECandidates (src/telehealth/sfuClient.ts:142:18)
    at LiveConsultSession.joinRoom (src/controllers/consultation.ts:88:12)
    at async handleConsultationSignaling (src/server.ts:112:8)`,
  },
  {
    id: 'err-002',
    serviceId: 'live-consult-service',
    serviceName: 'Live Consult Service',
    type: 'AudioVideoSyncException',
    message: 'High packet jitter buffer overflow during high concurrency video consult',
    statusCode: 500,
    occurrences: 240,
    firstSeen: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    lastSeen: new Date(Date.now() - 1000 * 40).toISOString(),
    affectedEndpoint: 'WS /api/v1/consultations/stream/track-sync',
    status: 'active',
    relatedTraceId: '4b21-99ee-11fa-77aa',
    stackTrace: `AudioVideoSyncException: Jitter buffer overflow: frames dropped exceeded 15% threshold
    at JitterBuffer.decodeFrame (src/media/jitter.ts:64:14)
    at StreamSession.processTrack (src/services/stream.ts:42:20)`,
  },
  {
    id: 'err-003',
    serviceId: 'medical-record-service',
    serviceName: 'Medical Record Service',
    type: 'EHRDecryptionValidationFailed',
    message: 'Encrypted patient record payload checksum signature mismatch during FHIR ingest',
    statusCode: 422,
    occurrences: 180,
    firstSeen: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    lastSeen: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    affectedEndpoint: 'GET /api/v1/ehr/patients/:id/records',
    status: 'active',
    relatedTraceId: '77ac-12de-44ff-0012',
    stackTrace: `EHRDecryptionError: AES-256-GCM authentication tag verification failed
    at CryptoEngine.decryptRecord (src/security/ehrCrypto.ts:98:12)
    at MedicalRecordService.getPatientHistory (src/services/record.ts:104:18)`,
  },
  {
    id: 'err-004',
    serviceId: 'identity-service',
    serviceName: 'Identity Service',
    type: 'InvalidJwtSignatureException',
    message: 'Expired or malformed clinician authorization bearer token presented',
    statusCode: 401,
    occurrences: 120,
    firstSeen: new Date(Date.now() - 1000 * 60 * 360).toISOString(),
    lastSeen: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    affectedEndpoint: 'POST /api/v1/auth/jwt/verify',
    status: 'acknowledged',
    stackTrace: `JsonWebTokenError: jwt signature is invalid or expired
    at verifyToken (node_modules/jsonwebtoken/index.js:82:12)
    at IdentityService.validateClinicianSession (src/services/auth.ts:45:10)`,
  },
  {
    id: 'err-005',
    serviceId: 'ai-consultation-service',
    serviceName: 'AI Consultation Service',
    type: 'MedicalLLMInferenceTimeout',
    message: 'Clinical diagnostic reasoning exceeded 5000ms latency ceiling during symptom triage',
    statusCode: 504,
    occurrences: 45,
    firstSeen: new Date(Date.now() - 1000 * 60 * 480).toISOString(),
    lastSeen: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
    affectedEndpoint: 'POST /api/v1/ai/triage-diagnostic',
    status: 'resolved',
    stackTrace: `InferenceTimeoutError: LLM Model cluster response timed out after 5000ms
    at ClinicalLLMClient.generateDiagnosis (src/ai/llmClient.ts:74:10)
    at AIConsultationEngine.triage (src/services/aiTriage.ts:32:8)`,
  },
  {
    id: 'err-006',
    serviceId: 'health-profile-service',
    serviceName: 'Health Profile Service',
    type: 'BiometricVitalsSchemaMismatch',
    message: 'Blood pressure & SpO2 sensor ingestion payload missing mandatory timestamp field',
    statusCode: 400,
    occurrences: 35,
    firstSeen: new Date(Date.now() - 1000 * 60 * 500).toISOString(),
    lastSeen: new Date(Date.now() - 1000 * 60 * 80).toISOString(),
    affectedEndpoint: 'POST /api/v1/profiles/vitals/ingest',
    status: 'acknowledged',
    stackTrace: `ValidationError: Missing required field 'recorded_at' in BiometricVitalsPayload
    at JSONValidator.validate (src/schema/vitals.ts:55:14)
    at ProfileController.saveVitals (src/controllers/profile.ts:32:8)`,
  },
  {
    id: 'err-007',
    serviceId: 'lifestyle-service',
    serviceName: 'Lifestyle Service',
    type: 'HealthKitSmartwatchSyncTimeout',
    message: 'Smartwatch activity batch synchronization payload rate limit exceeded',
    statusCode: 429,
    occurrences: 35,
    firstSeen: new Date(Date.now() - 1000 * 60 * 600).toISOString(),
    lastSeen: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    affectedEndpoint: 'POST /api/v1/lifestyle/smartwatch-sync',
    status: 'resolved',
    stackTrace: `RateLimitExceeded: Rate limit of 60 syncs/hr reached for patient ID
    at RateLimiter.checkQuota (src/middleware/rateLimiter.ts:78:12)
    at LifestyleService.syncActivity (src/services/lifestyle.ts:44:9)`,
  },
  {
    id: 'err-008',
    serviceId: 'audit-service',
    serviceName: 'Audit Service',
    type: 'AuditLogQueueBufferFlushed',
    message: 'Kafka audit event batch write retry triggered due to broker temporary rebalance',
    statusCode: 500,
    occurrences: 15,
    firstSeen: new Date(Date.now() - 1000 * 60 * 700).toISOString(),
    lastSeen: new Date(Date.now() - 1000 * 60 * 200).toISOString(),
    affectedEndpoint: 'POST /api/v1/audit/events',
    status: 'resolved',
    stackTrace: `KafkaCommitRetry: Producer batch flushed with retry after broker rebalance
    at KafkaProducer.emitAuditEvent (src/audit/producer.ts:112:15)
    at AuditTrailService.logAccess (src/services/audit.ts:88:20)`,
  },
];
