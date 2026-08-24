#!/usr/bin/env node
import http from 'node:http';

const port = Number(process.env.E2E_PROVIDER_PORT || 4100);
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

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'GET' && req.url === '/v1/models') {
    res.end(JSON.stringify({ data: [{ id: 'gpt-5.6-luna' }] }));
    return;
  }
  if (req.method === 'POST' && req.url === '/v1/chat/completions') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      const parsed = JSON.parse(body || '{}');
      res.end(JSON.stringify({
        id: 'e2e-chat-completion', model: parsed.model,
        choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(plan) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 120, completion_tokens: 260, total_tokens: 380 },
      }));
    });
    return;
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'E2E provider boundary route not implemented' }));
});

server.listen(port, '127.0.0.1', () => console.log(`E2E provider boundary listening on ${port}`));
