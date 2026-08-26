import { AppError } from '../middleware/errorHandler';
import {
  getDeliverableRoute,
  type DeliverableRoute,
  type MarketingCompositionMode,
} from './marketing-deliverable-registry.service';

type Json = Record<string, unknown>;

export interface CanonicalTextMaterialInput {
  deliverableKind: unknown;
  compositionMode: unknown;
  materialType: unknown;
  channel: unknown;
  dimensionsOrFormat: unknown;
  requiresOwnerApproval: unknown;
  campaignPlanId: unknown;
  briefId: unknown;
  title: string;
  generatedBody: string;
}

export interface CanonicalTextMaterial {
  body: string;
  format: 'markdown' | 'html' | 'json';
  metadata: Json;
  route: DeliverableRoute;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character] || character));
}

function paragraphs(value: string): string {
  return value.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`).join('\n');
}

function validateCanonicalContract(input: CanonicalTextMaterialInput): DeliverableRoute {
  const route = getDeliverableRoute(input.deliverableKind);
  const receivedMode = String(input.compositionMode || '');
  const receivedMaterial = String(input.materialType || '');
  const receivedChannel = String(input.channel || '');
  const receivedFormat = String(input.dimensionsOrFormat || '');
  if (route.ingredientOperation !== 'text_generation') {
    throw new AppError(409, `${route.kind} does not use the canonical text finalizer`, 'TEXT_FINALIZER_ROUTE_INVALID');
  }
  if (receivedMode !== route.composition || receivedMaterial !== route.materialType
    || receivedChannel !== route.primaryChannel || receivedFormat !== route.defaultDimensions
    || input.requiresOwnerApproval !== route.requiresOwnerApproval) {
    throw new AppError(409, `Canonical metadata for ${route.kind} does not match the deliverable registry`, 'TEXT_FINALIZER_METADATA_MISMATCH');
  }
  return route;
}

function bundleBody(mode: Extract<MarketingCompositionMode, 'campaign_bundle' | 'weekly_bundle'>, title: string, body: string): string {
  const heading = mode === 'weekly_bundle' ? 'Weekly marketing bundle' : 'Campaign marketing bundle';
  return `# ${heading}: ${title}\n\n${body.trim()}\n\n---\nOwner review is required before scheduling or publishing any item in this bundle.`;
}

/**
 * Converts governed text output into the explicit customer-facing material
 * represented by the deliverable registry. It never guesses from the provider
 * operation: a missing, unknown, or inconsistent canonical contract fails closed.
 */
export function finalizeCanonicalTextMaterial(input: CanonicalTextMaterialInput): CanonicalTextMaterial {
  const route = validateCanonicalContract(input);
  const source = String(input.generatedBody || '').trim();
  if (!source) throw new AppError(409, 'Generated Marketing copy is empty', 'TEXT_FINALIZER_EMPTY');

  let body: string;
  let format: CanonicalTextMaterial['format'];
  let customerObject: Json;
  if (route.composition === 'branded_copy') {
    body = source;
    format = 'markdown';
    customerObject = { kind: 'branded_copy', copy: source };
  } else if (route.composition === 'branded_html') {
    const documentKind = route.kind === 'email_campaign' ? 'email' : 'landing_page';
    body = `<article data-marketing-deliverable="${documentKind}">\n<header><h1>${escapeHtml(input.title)}</h1></header>\n${paragraphs(source)}\n</article>`;
    format = 'html';
    customerObject = { kind: 'branded_html', document_kind: documentKind, html: body, plain_text: source };
  } else if (route.composition === 'campaign_bundle' || route.composition === 'weekly_bundle') {
    body = bundleBody(route.composition, input.title, source);
    format = 'markdown';
    customerObject = {
      kind: route.composition,
      cadence: route.composition === 'weekly_bundle' ? 'weekly' : 'campaign',
      primary_copy: source,
      channel: route.primaryChannel,
    };
  } else {
    throw new AppError(409, `${route.composition} is not a canonical text material`, 'TEXT_FINALIZER_MODE_INVALID');
  }

  return {
    body,
    format,
    route,
    metadata: {
      material_role: 'final_marketing_content',
      material_mode: route.composition,
      material_type: route.materialType,
      deliverable_kind: route.kind,
      channel: route.primaryChannel,
      dimensions_or_format: route.defaultDimensions,
      requires_owner_approval: route.requiresOwnerApproval,
      campaign_plan_id: input.campaignPlanId || null,
      brief_id: input.briefId || null,
      customer_facing_object: customerObject,
      approval_state: 'pending_review',
    },
  };
}
