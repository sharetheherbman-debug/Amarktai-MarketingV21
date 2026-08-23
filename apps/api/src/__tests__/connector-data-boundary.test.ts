import { assertConnectorPayloadSafe } from '../utils/connector-data-boundary';

describe('Application Connector sensitive-data boundary', () => {
  test('accepts data-minimized generic marketing facts', () => {
    expect(() => assertConnectorPayloadSafe({
      app: { id: 'host-app', name: 'Host App', domain: 'example.com', product_lines: ['crm-pro'] },
      products: [{ name: 'CRM Pro', product_line: 'crm-pro', price_pence: 4900 }],
      offers: [{ name: 'Annual plan', product_lines: ['crm-pro'] }],
      campaign_id: '5ef2bb18-51b1-4c9e-bb79-a1f8244d5669',
      source: 'host_application',
    })).not.toThrow();
  });

  test.each([
    { customer_email: 'person@example.com' },
    { nested: { access_token: 'secret-token' } },
    { checkout: { card_number: '4111111111111111' } },
    { horse: { veterinary_notes: 'private clinical information' } },
    { academy: { teacher_feedback: 'private feedback' } },
    { supplier: { supplier_cost: 1000 } },
  ])('rejects sensitive/private fields: %j', (payload) => {
    expect(() => assertConnectorPayloadSafe(payload)).toThrow(/Sensitive\/private connector field is not allowed/);
  });

  test('fails closed on pathological nesting', () => {
    let payload: Record<string, unknown> = { value: true };
    for (let index = 0; index < 22; index += 1) payload = { nested: payload };
    expect(() => assertConnectorPayloadSafe(payload)).toThrow(/nesting is too deep/);
  });
});
