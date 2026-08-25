#!/usr/bin/env node
import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

const port = Number(process.env.E2E_PROVIDER_PORT || 4100);
const ingredientPath = path.resolve(process.cwd(), 'tests/e2e/fixtures/acceptance-ingredient.png');
let nextJob = 1;
const jobs = new Map();

const plan = {
  brief: { objective_stage: 'conversion', objective: 'Grow qualified Academy enrolments', success_criteria: ['Qualified visits'], audience_segments: [{ name: 'UK horse owners', needs: ['Trusted learning'], objections: [], motivations: ['Better care'] }], offer: 'Explore the Academy', value_proposition: 'Practical grounded learning', proof_points: [], calls_to_action: ['Explore the Academy'], language: 'en-GB' },
  strategy: { overview: 'A grounded educational launch', positioning: 'Useful and responsible', journey: ['discover','consider'], key_messages: ['Learn with confidence'], channel_rationale: { social: 'Reach owners' } },
  creative_concept: { name: 'Confident Care', central_idea: 'Knowledge supports better decisions', hook: 'Make the next horse-care decision with confidence', narrative: 'Lead with useful education.', visual_direction: 'Natural equestrian learning environments', voice_direction: 'Clear and warm' },
  messaging_plan: { primary_message: 'Practical equestrian learning for responsible owners', supporting_messages: ['Grounded guidance'], objection_responses: [], cta_hierarchy: ['Explore the Academy'] },
  channels: { social: { enabled: true }, email: {}, content: {}, seo: {}, advertising: {} },
  content_calendar: [{ date: '2026-09-01', platform: 'linkedin', content_type: 'social', topic: 'Launch', status: 'planned', brief_id: 'launch-social' }],
  asset_requirements: [{ brief_id: 'launch-social', platform: 'linkedin', format: 'social', purpose: 'Launch awareness', hook: 'Confident care', message: 'Explore useful learning', cta: 'Explore the Academy', dimensions_or_length: 'Short post', accessibility_requirements: ['Plain text'], variations: 1 }],
  kpis: { primary: ['Qualified visits'], secondary: ['Engagement'], tracking_requirements: ['UTM'] },
  optimization_plan: { signals: ['Clicks'], recommendation_rules: [], owner_approval_required: true },
  constraints: { brand_restrictions: ['Verified claims only'], prohibited_claims: ['Guarantees'], missing_information: [], owner_checks: ['Final copy'] },
};

function json(res, payload, status = 200) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function mediaUrl(req) {
  return `http://${req.headers.host}/api/v1/media/acceptance-ingredient.png`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  if (req.method === 'GET' && url.pathname === '/api/v1/media/acceptance-ingredient.png') {
    try {
      const bytes = await readFile(ingredientPath);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Length', String(bytes.byteLength));
      res.setHeader('Cache-Control', 'no-store');
      res.end(bytes);
    } catch (error) {
      json(res, { error: `Candidate ingredient fixture is unavailable: ${error instanceof Error ? error.message : String(error)}` }, 500);
    }
    return;
  }
  if (req.method === 'GET' && (url.pathname === '/v1/models' || url.pathname === '/api/v1/models')) {
    json(res, { data: [
      { id: 'gpt-5.6-luna', model: 'gpt-5.6-luna', name: 'Candidate text boundary', category: 'text', operations: ['chat'], available: true },
      { id: 'e2e-image-model', model: 'e2e-image-model', name: 'Candidate image fixture boundary', category: 'image', operations: ['text_to_image'], available: true },
    ] });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/v1/chat/completions') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      const parsed = JSON.parse(body || '{}');
      json(res, {
        id: 'e2e-chat-completion', model: parsed.model,
        choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(plan) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 120, completion_tokens: 260, total_tokens: 380 },
      });
    });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/generate') {
    const id = `candidate-image-${nextJob++}`;
    const resultUrl = mediaUrl(req);
    jobs.set(id, { id, model: 'e2e-image-model', status: 'completed', progress: 100, result_url: resultUrl, result_data: { candidate_fixture: true, provider_boundary: 'local' }, usage: { cost: 0.02 } });
    json(res, { data: jobs.get(id) });
    return;
  }
  const jobMatch = url.pathname.match(/^\/api\/v1\/jobs\/([^/]+)(?:\/(result|file))?$/);
  if (req.method === 'GET' && jobMatch) {
    const job = jobs.get(decodeURIComponent(jobMatch[1]));
    if (!job) { json(res, { error: 'Unknown candidate job' }, 404); return; }
    if (jobMatch[2] === 'file') { json(res, { data: { url: job.result_url, filename: 'acceptance-ingredient.png' } }); return; }
    if (jobMatch[2] === 'result') { json(res, { data: { url: job.result_url, result_url: job.result_url, candidate_fixture: true } }); return; }
    json(res, { data: job });
    return;
  }
  json(res, { error: 'E2E provider boundary route not implemented' }, 404);
});

server.listen(port, '127.0.0.1', () => console.log(`E2E provider boundary listening on ${port}`));
