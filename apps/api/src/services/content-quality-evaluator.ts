export interface QualityEvaluationInput {
  text: string;
  type: string;
  platform?: string | null;
  metadata?: Record<string, unknown>;
  prohibitedPhrases?: string[];
}

export interface QualityDimension {
  type: 'campaign_alignment' | 'brand_voice' | 'compliance' | 'platform' | 'cta' | 'originality' | 'accessibility';
  score: number;
  passed: boolean;
  issues: Array<{ type: string; message: string; severity: 'error' | 'warning' | 'info' }>;
  suggestions: string[];
}

function words(value: string): string[] {
  return value.toLowerCase().match(/[\p{L}\p{N}']+/gu) || [];
}

function includesNormalised(text: string, value: string): boolean {
  return text.toLocaleLowerCase().includes(value.trim().toLocaleLowerCase());
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
}

export function evaluateContentQuality(input: QualityEvaluationInput): QualityDimension[] {
  const text = input.text.trim();
  const metadata = input.metadata || {};
  const brief = (metadata.quality_brief && typeof metadata.quality_brief === 'object')
    ? metadata.quality_brief as Record<string, unknown>
    : {};
  const dimensions: QualityDimension[] = [];

  const requiredTerms = asStringArray(brief.required_terms);
  const missingTerms = requiredTerms.filter((term) => !includesNormalised(text, term));
  const concept = String(brief.campaign_concept || '').trim();
  const alignmentIssues: QualityDimension['issues'] = missingTerms.map((term) => ({
    type: 'missing_brief_element', message: `Required campaign element is missing: ${term}`, severity: 'error',
  }));
  if (concept && !includesNormalised(text, concept)) {
    alignmentIssues.push({ type: 'concept_drift', message: 'The approved campaign concept is not reflected in this asset.', severity: 'warning' });
  }
  dimensions.push({
    type: 'campaign_alignment',
    score: Math.max(0, 100 - missingTerms.length * 25 - (concept && !includesNormalised(text, concept) ? 15 : 0)),
    passed: alignmentIssues.every((issue) => issue.severity !== 'error'),
    issues: alignmentIssues,
    suggestions: alignmentIssues.length ? ['Revise the selected asset without changing the approved campaign facts.'] : [],
  });

  const prohibited = [...new Set([...input.prohibitedPhrases || [], ...asStringArray(brief.prohibited_claims)])];
  const brandIssues: QualityDimension['issues'] = prohibited
    .filter((phrase) => includesNormalised(text, phrase))
    .map((phrase) => ({ type: 'prohibited_phrase', message: `Contains prohibited wording: ${phrase}`, severity: 'error' }));
  dimensions.push({
    type: 'brand_voice', score: Math.max(0, 100 - brandIssues.length * 35), passed: brandIssues.length === 0,
    issues: brandIssues, suggestions: brandIssues.length ? ['Replace prohibited wording with an approved brand-safe alternative.'] : [],
  });

  const allowedClaims = asStringArray(brief.allowed_claims);
  const approvedPrices = asStringArray(brief.approved_prices);
  const riskyClaims = [
    /\bguarantee(?:d|s)?\b/gi,
    /\b(?:number|no\.?)[ -]?1\b/gi,
    /\b\d+(?:\.\d+)?%\b/g,
    /\b(?:clinically|scientifically) proven\b/gi,
  ];
  const foundClaims = riskyClaims.flatMap((pattern) => text.match(pattern) || []);
  const unsupported = foundClaims.filter((claim) => !allowedClaims.some((allowed) => includesNormalised(allowed, claim)));
  const complianceIssues: QualityDimension['issues'] = unsupported.map((claim) => ({
    type: 'unsupported_claim', message: `Potentially unsupported claim requires owner evidence: ${claim}`, severity: 'error',
  }));

  const priceClaims = text.match(/(?:R|ZAR|£|GBP|\$|USD|€|EUR)\s?\d[\d,.]*(?:\.\d{1,2})?|\d[\d,.]*(?:\.\d{1,2})?\s?(?:ZAR|GBP|USD|EUR)\b/gi) || [];
  for (const price of priceClaims) {
    if (!approvedPrices.some((approved) => includesNormalised(approved, price)) && !allowedClaims.some((allowed) => includesNormalised(allowed, price))) {
      complianceIssues.push({ type: 'unsupported_price', message: `Price or monetary claim is not present in the approved campaign evidence: ${price}`, severity: 'error' });
    }
  }

  const lifecycle = String(brief.lifecycle_status || metadata.lifecycle_status || '').trim().toLowerCase();
  const unavailableLifecycle = ['coming_soon', 'paused', 'retired', 'internal'].includes(lifecycle);
  if (unavailableLifecycle) {
    const purchasePatterns = [
      /\bbuy now\b/i,
      /\bshop now\b/i,
      /\border now\b/i,
      /\bcheckout\b/i,
      /\badd to cart\b/i,
      /\bavailable now\b/i,
      /\bpurchase (?:now|today)\b/i,
    ];
    for (const pattern of purchasePatterns) {
      const match = text.match(pattern)?.[0];
      if (match) {
        complianceIssues.push({
          type: 'product_lifecycle_conflict',
          message: `This product/service is ${lifecycle}; active-purchase wording is not allowed: ${match}`,
          severity: 'error',
        });
      }
    }
  }

  dimensions.push({
    type: 'compliance', score: Math.max(0, 100 - complianceIssues.length * 30), passed: complianceIssues.length === 0,
    issues: complianceIssues,
    suggestions: complianceIssues.length ? ['Remove unsupported factual/commercial claims or attach approved evidence before publication. Respect the current product lifecycle.'] : [],
  });

  const platform = String(input.platform || '').toLowerCase();
  const platformIssues: QualityDimension['issues'] = [];
  if (platform === 'x' && text.length > 280) platformIssues.push({ type: 'platform_length', message: 'X content exceeds 280 characters.', severity: 'error' });
  if (platform === 'instagram' && text.length > 2200) platformIssues.push({ type: 'platform_length', message: 'Instagram caption exceeds 2,200 characters.', severity: 'error' });
  if (input.type === 'email' && !String(brief.subject || '').trim()) platformIssues.push({ type: 'missing_subject', message: 'Email content requires a subject line in its brief.', severity: 'warning' });
  dimensions.push({
    type: 'platform', score: Math.max(0, 100 - platformIssues.length * 35), passed: platformIssues.every((issue) => issue.severity !== 'error'),
    issues: platformIssues, suggestions: platformIssues.length ? ['Create a platform-specific variation rather than truncating another channel asset.'] : [],
  });

  const approvedCtas = asStringArray(brief.calls_to_action);
  const hasCta = approvedCtas.some((cta) => includesNormalised(text, cta)) || /\b(book|contact|discover|download|enquire|explore|get started|join|learn more|register|shop|subscribe|try|visit)\b/i.test(text);
  dimensions.push({
    type: 'cta', score: hasCta ? 100 : 35, passed: hasCta,
    issues: hasCta ? [] : [{ type: 'missing_cta', message: 'No clear call to action was found.', severity: 'warning' }],
    suggestions: hasCta ? [] : ['Use one approved, specific next step.'],
  });

  const sentences = text.split(/[.!?]+/).map((sentence) => words(sentence).join(' ')).filter((sentence) => sentence.length > 20);
  const duplicates = sentences.filter((sentence, index) => sentences.indexOf(sentence) !== index);
  const cliches = ['unlock the power', 'game changer', 'take it to the next level', 'in today’s fast-paced world', 'in today\'s fast-paced world'];
  const foundCliches = cliches.filter((phrase) => includesNormalised(text, phrase));
  const originalityIssues: QualityDimension['issues'] = [
    ...duplicates.map(() => ({ type: 'repetition', message: 'A sentence is repeated in this asset.', severity: 'warning' as const })),
    ...foundCliches.map((phrase) => ({ type: 'generic_filler', message: `Generic phrase detected: ${phrase}`, severity: 'warning' as const })),
  ];
  dimensions.push({
    type: 'originality', score: Math.max(0, 100 - originalityIssues.length * 15), passed: originalityIssues.length === 0,
    issues: originalityIssues, suggestions: originalityIssues.length ? ['Replace repetition and generic filler with concrete audience-specific language.'] : [],
  });

  const mediaType = ['image', 'video', 'asset'].includes(input.type);
  const altText = String(metadata.alt_text || brief.alt_text || '').trim();
  const accessibilityIssues: QualityDimension['issues'] = mediaType && !altText
    ? [{ type: 'missing_alt_text', message: 'Media content requires accessibility text.', severity: 'error' }]
    : [];
  dimensions.push({
    type: 'accessibility', score: accessibilityIssues.length ? 0 : 100, passed: accessibilityIssues.length === 0,
    issues: accessibilityIssues, suggestions: accessibilityIssues.length ? ['Add concise, meaningful alternative text before approval.'] : [],
  });

  return dimensions;
}
