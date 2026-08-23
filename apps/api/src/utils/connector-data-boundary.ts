import { AppError } from '../middleware/errorHandler';

const forbiddenExactKeys = new Set([
  'password',
  'password_hash',
  'passcode',
  'access_token',
  'refresh_token',
  'id_token',
  'auth_token',
  'api_key',
  'client_secret',
  'authorization',
  'cookie',
  'set_cookie',
  'card_number',
  'card_data',
  'pan',
  'cvv',
  'cvc',
  'payment_token',
  'bank_account',
  'iban',
  'sort_code',
  'routing_number',
  'email',
  'email_address',
  'phone',
  'phone_number',
  'mobile',
  'address',
  'street_address',
  'postcode',
  'postal_code',
  'health',
  'medical',
  'diagnosis',
  'treatment',
  'medication',
  'vet',
  'veterinary',
  'learner_progress',
  'student_progress',
  'teacher_feedback',
  'tutor_chat',
  'learning_record',
  'supplier_cost',
  'wholesale_cost',
  'cost_price',
  'unit_cost',
  'purchase_cost',
]);

const forbiddenSuffixes = [
  '_password',
  '_secret',
  '_token',
  '_api_key',
  '_card_number',
  '_cvv',
  '_cvc',
  '_email',
  '_phone',
  '_mobile',
  '_address',
  '_postcode',
  '_postal_code',
];

const forbiddenPrefixes = [
  'health_',
  'medical_',
  'diagnosis_',
  'treatment_',
  'medication_',
  'vet_',
  'veterinary_',
  'teacher_feedback_',
  'tutor_chat_',
  'supplier_cost_',
  'wholesale_cost_',
];

function normalizedKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function isForbiddenKey(key: string): boolean {
  const normalized = normalizedKey(key);
  return forbiddenExactKeys.has(normalized)
    || forbiddenSuffixes.some((suffix) => normalized.endsWith(suffix))
    || forbiddenPrefixes.some((prefix) => normalized.startsWith(prefix));
}

/**
 * Reject sensitive/private data at the Marketing connector boundary.
 *
 * SSO payloads are intentionally not passed through this guard because the SSO
 * protocol requires an administrator email. Conversion properties and business
 * snapshots must remain marketing-safe and data-minimized.
 */
export function assertConnectorPayloadSafe(value: unknown, path = 'payload', depth = 0): void {
  if (depth > 20) {
    throw new AppError(400, 'Connector payload nesting is too deep', 'CONNECTOR_PAYLOAD_TOO_DEEP');
  }
  if (value === null || value === undefined || typeof value !== 'object') return;

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertConnectorPayloadSafe(item, `${path}[${index}]`, depth + 1));
    return;
  }

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (isForbiddenKey(key)) {
      throw new AppError(
        400,
        `Sensitive/private connector field is not allowed: ${path}.${key}`,
        'CONNECTOR_SENSITIVE_FIELD_REJECTED',
      );
    }
    assertConnectorPayloadSafe(nested, `${path}.${key}`, depth + 1);
  }
}
