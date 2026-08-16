import { query } from '../config/database';

interface WorkforceRole {
  key: string;
  name: string;
  mission: string;
  capabilities: string[];
  tools: string[];
}

export const MARKETING_WORKFORCE: WorkforceRole[] = [
  { key: 'marketing-director', name: 'Marketing Director', mission: 'Coordinate the continuous growth lifecycle, delegate specialist work, enforce evidence and safety gates, and keep durable state.', capabilities: ['orchestration','strategy','quality_control'], tools: ['search_knowledge','get_analytics','create_task'] },
  { key: 'campaign-strategist', name: 'Campaign Strategist', mission: 'Develop internally validated multi-channel strategies from the shared business brain.', capabilities: ['campaign_strategy','positioning'], tools: ['search_knowledge','web_search','generate_text'] },
  { key: 'campaign-manager', name: 'Campaign Manager', mission: 'Turn validated strategy into briefs, calendars, dependencies, and measurable execution plans.', capabilities: ['campaign_management','planning'], tools: ['create_task','get_analytics'] },
  { key: 'market-researcher', name: 'Market Researcher', mission: 'Find current market, audience, and category evidence without inventing business facts.', capabilities: ['research','audience_insight'], tools: ['web_search','search_knowledge'] },
  { key: 'competitive-intelligence', name: 'Competitive Intelligence Analyst', mission: 'Monitor competitor and category changes and surface material opportunities.', capabilities: ['competitor_research','trend_detection'], tools: ['web_search','search_knowledge'] },
  { key: 'brand-strategist', name: 'Brand Strategist', mission: 'Protect brand voice, positioning, claims, and visual consistency.', capabilities: ['brand_governance','positioning'], tools: ['search_knowledge','generate_text'] },
  { key: 'content-strategist', name: 'Content Strategist', mission: 'Plan a reusable, stage-aware content portfolio before requesting net-new generation.', capabilities: ['content_strategy','reuse_planning'], tools: ['search_knowledge','get_analytics','create_task'] },
  { key: 'copywriter', name: 'Copywriter', mission: 'Create clear channel-specific drafts grounded in approved facts and briefs.', capabilities: ['copywriting','adaptation'], tools: ['search_knowledge','generate_text'] },
  { key: 'editor', name: 'Editor and Quality Lead', mission: 'Revise drafts against brand, factual, accessibility, and channel quality criteria.', capabilities: ['editing','quality_assurance'], tools: ['search_knowledge','generate_text'] },
  { key: 'seo-specialist', name: 'SEO Specialist', mission: 'Improve discoverability while preserving reader value and factual integrity.', capabilities: ['seo','content_optimization'], tools: ['analyze_seo','web_search','get_analytics'] },
  { key: 'social-manager', name: 'Social Media Manager', mission: 'Adapt approved content for supported social channels and prepare governed distribution.', capabilities: ['social_strategy','community'], tools: ['search_knowledge','create_social_post','schedule_post','get_analytics'] },
  { key: 'email-specialist', name: 'Email Marketing Specialist', mission: 'Create consent-aware lifecycle and campaign email programs with measurable outcomes.', capabilities: ['email_marketing','lifecycle'], tools: ['search_knowledge','send_email','get_analytics'] },
  { key: 'creative-director', name: 'Creative Director', mission: 'Translate campaign concepts into coherent, accessible visual and motion systems.', capabilities: ['creative_direction','visual_systems'], tools: ['search_knowledge','generate_image','create_task'] },
  { key: 'video-producer', name: 'Video Producer', mission: 'Design platform-appropriate video briefs, variants, continuity, and production plans.', capabilities: ['video_strategy','storyboarding'], tools: ['search_knowledge','generate_image','create_task'] },
  { key: 'conversion-specialist', name: 'Conversion Optimisation Specialist', mission: 'Develop evidence-led landing-page and journey improvements and bounded experiments.', capabilities: ['cro','experimentation'], tools: ['get_analytics','analyze_seo','create_task'] },
  { key: 'analytics-lead', name: 'Marketing Analytics Lead', mission: 'Maintain attribution, evaluate performance, and distinguish evidence from inference.', capabilities: ['analytics','attribution','measurement'], tools: ['get_analytics','create_task'] },
  { key: 'crm-lifecycle', name: 'CRM and Lifecycle Specialist', mission: 'Coordinate consent-aware retention, reactivation, and customer journey opportunities.', capabilities: ['crm','retention'], tools: ['get_analytics','send_email','create_task'] },
  { key: 'paid-media-analyst', name: 'Paid Media Analyst', mission: 'Provide read-only paid-media analysis and recommendations; never activate or spend.', capabilities: ['advertising_analysis','budget_advice'], tools: ['get_analytics','create_task'] },
  { key: 'governance-officer', name: 'Marketing Governance Officer', mission: 'Enforce approval, consent, truthfulness, platform capability, privacy, and emergency-stop rules.', capabilities: ['compliance','approval_governance','risk'], tools: ['search_knowledge','create_task'] },
];

export async function ensureMarketingWorkforce(organizationId: string): Promise<number> {
  let created = 0;
  for (const role of MARKETING_WORKFORCE) {
    const result = await query(
      `INSERT INTO agents
         (organization_id,name,description,type,config,system_prompt,model,provider,status,capabilities,tools,is_system,system_role_key)
       VALUES ($1,$2,$3,'specialist',$4,$5,NULL,'genx','active',$6,$7,TRUE,$8)
       ON CONFLICT (organization_id,system_role_key) WHERE system_role_key IS NOT NULL AND deleted_at IS NULL
       DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,system_prompt=EXCLUDED.system_prompt,
                     capabilities=EXCLUDED.capabilities,tools=EXCLUDED.tools,is_system=TRUE,status='active',updated_at=NOW()
       RETURNING (xmax=0) AS inserted`,
      [organizationId, role.name, role.mission, JSON.stringify({ governed: true, shared_business_brain: true }),
        `${role.mission} Use the shared living business brain. Never invent facts. Draft autonomously, but never bypass owner approval for final customer-facing content or Relaunch Control for external actions.`,
        JSON.stringify(role.capabilities), JSON.stringify(role.tools), role.key]
    );
    if (result.rows[0]?.inserted === true) created += 1;
  }
  return created;
}

export async function ensureAllOrganizationWorkforces(limit = 100): Promise<number> {
  const organizations = await query('SELECT id FROM organizations ORDER BY created_at ASC LIMIT $1', [limit]);
  let created = 0;
  for (const row of organizations.rows) created += await ensureMarketingWorkforce(String(row.id));
  return created;
}
