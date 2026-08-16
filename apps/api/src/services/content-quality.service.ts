import { query } from '../config/database';
import { logger } from '../utils/logger';
import { ContentQualityCheck, QualityIssue, QualityReport } from '../types';
import { evaluateContentQuality } from './content-quality-evaluator';

// ─── Quality Checks ──────────────────────────────────────────────────────────

export async function runQualityChecks(contentId: string, orgId: string): Promise<QualityReport> {
  const contentResult = await query(
    'SELECT * FROM content_items WHERE id = $1 AND organization_id = $2',
    [contentId, orgId]
  );

  if (contentResult.rows.length === 0) {
    return { overall_score: 0, checks: [], passed: false };
  }

  const content = contentResult.rows[0];
  const body = (content.body as string) || '';

  const checks: ContentQualityCheck[] = [];

  // Run all checks
  checks.push(await checkGrammar(contentId, orgId, body));
  checks.push(await checkReadability(contentId, orgId, body));
  checks.push(await checkBrandVoice(contentId, orgId, body));
  checks.push(await checkCta(contentId, orgId, body));

  const brandResult = await query('SELECT prohibited_phrases FROM brand_dna WHERE organization_id=$1', [orgId]);
  const prohibitedPhrases = Array.isArray(brandResult.rows[0]?.prohibited_phrases)
    ? brandResult.rows[0].prohibited_phrases.map(String)
    : [];
  const metadata = typeof content.metadata === 'string' ? JSON.parse(content.metadata) : content.metadata || {};
  for (const evaluation of evaluateContentQuality({
    text: body,
    type: String(content.type),
    platform: content.platform ? String(content.platform) : null,
    metadata,
    prohibitedPhrases,
  })) {
    await query(
      `INSERT INTO content_quality_checks
         (content_id,organization_id,check_type,score,issues,suggestions,passed)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [contentId, orgId, evaluation.type, evaluation.score, JSON.stringify(evaluation.issues), JSON.stringify(evaluation.suggestions), evaluation.passed]
    );
    checks.push({
      id: '', content_id: contentId, organization_id: orgId,
      check_type: evaluation.type, score: evaluation.score,
      issues: evaluation.issues, suggestions: evaluation.suggestions,
      passed: evaluation.passed, created_at: new Date().toISOString(),
    });
  }

  // Calculate overall score
  const totalScore = checks.reduce((sum, c) => sum + c.score, 0) / checks.length;
  const allPassed = checks.every(c => c.passed);

  // Update content quality scores
  await query(
    'UPDATE content_items SET quality_score = $1, readability_score = $2, brand_voice_score = $3 WHERE id = $4',
    [totalScore, checks[1]?.score || 0, checks[2]?.score || 0, contentId]
  );

  return {
    overall_score: totalScore,
    checks,
    passed: allPassed,
  };
}

async function checkGrammar(contentId: string, orgId: string, text: string): Promise<ContentQualityCheck> {
  const issues: QualityIssue[] = [];
  const suggestions: string[] = [];

  // Basic grammar checks
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (trimmed.length > 0 && trimmed[0] !== trimmed[0].toUpperCase()) {
      issues.push({ type: 'capitalization', message: 'Sentence should start with a capital letter.', severity: 'warning' });
    }
  }

  // Check for double spaces
  if (text.includes('  ')) {
    issues.push({ type: 'spacing', message: 'Double spaces found.', severity: 'info' });
    suggestions.push('Remove double spaces.');
  }

  const score = Math.max(0, 100 - issues.length * 5);
  const passed = score >= 70;

  const result: ContentQualityCheck = {
    id: '',
    content_id: contentId,
    organization_id: orgId,
    check_type: 'grammar',
    score,
    issues,
    suggestions,
    passed,
    created_at: new Date().toISOString(),
  };

  await query(
    `INSERT INTO content_quality_checks (content_id, organization_id, check_type, score, issues, suggestions, passed)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [contentId, orgId, 'grammar', score, JSON.stringify(issues), JSON.stringify(suggestions), passed]
  );

  return result;
}

async function checkReadability(contentId: string, orgId: string, text: string): Promise<ContentQualityCheck> {
  const issues: QualityIssue[] = [];
  const suggestions: string[] = [];

  const words = text.split(/\s+/).filter(w => w.length > 0);
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const avgWordsPerSentence = words.length / Math.max(sentences.length, 1);

  if (avgWordsPerSentence > 25) {
    issues.push({ type: 'sentence_length', message: `Average sentence length is ${Math.round(avgWordsPerSentence)} words. Aim for under 25.`, severity: 'warning' });
    suggestions.push('Break long sentences into shorter ones.');
  }

  // Check for very short content
  if (words.length < 50) {
    issues.push({ type: 'length', message: 'Content is very short. Consider adding more detail.', severity: 'info' });
  }

  // Calculate readability score (simplified Flesch-Kincaid)
  const syllableCount = words.reduce((count, word) => count + countSyllables(word), 0);
  const readabilityIndex = 206.835 - 1.015 * avgWordsPerSentence - 84.6 * (syllableCount / Math.max(words.length, 1));
  const score = Math.min(100, Math.max(0, readabilityIndex));
  const passed = score >= 50;

  const result: ContentQualityCheck = {
    id: '',
    content_id: contentId,
    organization_id: orgId,
    check_type: 'readability',
    score,
    issues,
    suggestions,
    passed,
    created_at: new Date().toISOString(),
  };

  await query(
    `INSERT INTO content_quality_checks (content_id, organization_id, check_type, score, issues, suggestions, passed)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [contentId, orgId, 'readability', score, JSON.stringify(issues), JSON.stringify(suggestions), passed]
  );

  return result;
}

async function checkBrandVoice(contentId: string, orgId: string, text: string): Promise<ContentQualityCheck> {
  const issues: QualityIssue[] = [];
  const suggestions: string[] = [];

  // Get brand DNA
  const brandResult = await query(
    'SELECT * FROM brand_dna WHERE organization_id = $1',
    [orgId]
  );

  let score = 80; // Default score if no brand DNA

  if (brandResult.rows.length > 0) {
    const brand = brandResult.rows[0];
    const prohibitedPhrases: string[] = brand.prohibited_phrases || [];

    // Check for prohibited phrases
    const lowerText = text.toLowerCase();
    for (const phrase of prohibitedPhrases) {
      if (lowerText.includes(phrase.toLowerCase())) {
        issues.push({ type: 'prohibited', message: `Contains prohibited phrase: "${phrase}"`, severity: 'error' });
        score -= 15;
      }
    }

    // Check tone keywords
    const tone = brand.tone || 'professional';
    if (tone === 'casual') {
      const formalWords = ['hereby', 'whereas', 'aforementioned', 'notwithstanding'];
      for (const word of formalWords) {
        if (lowerText.includes(word)) {
          issues.push({ type: 'tone', message: `Formal word "${word}" may not match casual tone.`, severity: 'warning' });
          score -= 5;
        }
      }
    }

    suggestions.push(`Maintain ${tone} tone throughout.`);
  }

  score = Math.max(0, Math.min(100, score));
  const passed = score >= 60;

  const result: ContentQualityCheck = {
    id: '',
    content_id: contentId,
    organization_id: orgId,
    check_type: 'brand_voice',
    score,
    issues,
    suggestions,
    passed,
    created_at: new Date().toISOString(),
  };

  await query(
    `INSERT INTO content_quality_checks (content_id, organization_id, check_type, score, issues, suggestions, passed)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [contentId, orgId, 'brand_voice', score, JSON.stringify(issues), JSON.stringify(suggestions), passed]
  );

  return result;
}

async function checkCta(contentId: string, orgId: string, text: string): Promise<ContentQualityCheck> {
  const issues: QualityIssue[] = [];
  const suggestions: string[] = [];

  const ctaPatterns = [
    /\b(sign up|subscribe|learn more|get started|try|buy|order|download|contact|call|visit|click|join|register|book|schedule)\b/gi,
    /\b(today|now|free|limited|exclusive|special)\b/gi,
  ];

  let ctaCount = 0;
  for (const pattern of ctaPatterns) {
    const matches = text.match(pattern);
    if (matches) ctaCount += matches.length;
  }

  if (ctaCount === 0) {
    issues.push({ type: 'missing_cta', message: 'No call-to-action found in the content.', severity: 'warning' });
    suggestions.push('Add a clear call-to-action to guide the reader.');
  }

  const score = ctaCount > 0 ? Math.min(100, 70 + ctaCount * 10) : 40;
  const passed = ctaCount > 0;

  const result: ContentQualityCheck = {
    id: '',
    content_id: contentId,
    organization_id: orgId,
    check_type: 'cta',
    score,
    issues,
    suggestions,
    passed,
    created_at: new Date().toISOString(),
  };

  await query(
    `INSERT INTO content_quality_checks (content_id, organization_id, check_type, score, issues, suggestions, passed)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [contentId, orgId, 'cta', score, JSON.stringify(issues), JSON.stringify(suggestions), passed]
  );

  return result;
}

export async function getQualityChecks(contentId: string, orgId: string): Promise<ContentQualityCheck[]> {
  const result = await query(
    'SELECT * FROM content_quality_checks WHERE content_id = $1 AND organization_id = $2 ORDER BY created_at DESC',
    [contentId, orgId]
  );
  return result.rows.map(row => ({
    id: row.id as string,
    content_id: row.content_id as string,
    organization_id: row.organization_id as string,
    check_type: row.check_type as ContentQualityCheck['check_type'],
    score: parseFloat(row.score as string),
    issues: typeof row.issues === 'string' ? JSON.parse(row.issues) : row.issues || [],
    suggestions: typeof row.suggestions === 'string' ? JSON.parse(row.suggestions) : row.suggestions || [],
    passed: row.passed as boolean,
    created_at: row.created_at as string,
  }));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function countSyllables(word: string): number {
  word = word.toLowerCase().replace(/[^a-z]/g, '');
  if (word.length <= 3) return 1;
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
  word = word.replace(/^y/, '');
  const matches = word.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
}
