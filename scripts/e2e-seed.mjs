#!/usr/bin/env node
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import path from 'node:path';
import { stat } from 'node:fs/promises';

const { Client } = pg;
const databaseUrl = String(process.env.DATABASE_URL || '').trim();
if (!databaseUrl) throw new Error('DATABASE_URL is required');

export const E2E = {
  userId: '10000000-0000-4000-8000-000000000001',
  organizationId: '10000000-0000-4000-8000-000000000002',
  contentId: '10000000-0000-4000-8000-000000000003',
  brandLogoAssetId: '10000000-0000-4000-8000-000000000004',
  email: 'owner.e2e@example.test',
  password: 'E2e-owner-password-24!',
  recoveryCode: 'E2E-OWNER-RECOVERY-24',
};

const E2E_MODEL_IDS = ['gpt-5.6-luna', 'e2e-image-model', 'e2e-video-model'];
const jwtSecret = String(process.env.JWT_SECRET || 'test-jwt-secret-that-is-long-enough');
const recoveryHash = crypto.createHmac('sha256', jwtSecret)
  .update(E2E.recoveryCode.replace(/\s/g, '').toUpperCase()).digest('hex');
const passwordHash = await bcrypt.hash(E2E.password, 12);
const brandLogoPath = path.resolve(process.cwd(), 'tests/e2e/fixtures/acceptance-brand-logo.svg');
const brandLogoStat = await stat(brandLogoPath);
const client = new Client({ connectionString: databaseUrl });
await client.connect();

try {
  await client.query('BEGIN');
  // Clear the isolated organization first so its governed-generation reservations
  // release their price-snapshot foreign keys. The named catalogue fixtures are
  // global, so only remove them after that candidate-owned history has cascaded.
  await client.query('DELETE FROM organizations WHERE id=$1', [E2E.organizationId]);
  await client.query('DELETE FROM users WHERE id=$1 OR email=$2', [E2E.userId, E2E.email]);
  await client.query('DELETE FROM genx_price_snapshots WHERE model_id = ANY($1::text[])', [E2E_MODEL_IDS]);
  await client.query('DELETE FROM genx_models WHERE id = ANY($1::text[])', [E2E_MODEL_IDS]);
  await client.query(
    `INSERT INTO organizations (id,name,slug,plan,status,settings)
     VALUES ($1,'Acceptance Workspace','acceptance-workspace','enterprise','active','{}')`,
    [E2E.organizationId]
  );
  await client.query(
    `INSERT INTO users
       (id,email,password_hash,name,role,email_verified,status,two_factor_enabled,
        two_factor_secret,two_factor_recovery_codes,two_factor_enrolled_at)
     VALUES ($1,$2,$3,'Acceptance Owner','admin',TRUE,'active',TRUE,'{}',$4,NOW())`,
    [E2E.userId, E2E.email, passwordHash, JSON.stringify([recoveryHash])]
  );
  await client.query(
    `INSERT INTO organization_members (organization_id,user_id,role)
     VALUES ($1,$2,'owner')`,
    [E2E.organizationId, E2E.userId]
  );
  await client.query(
    `INSERT INTO relaunch_control_policies
       (organization_id,operating_mode,emergency_stop,daily_generation_credit_limit,
        per_action_credit_limit,approval_credit_threshold,allowed_channels,
        require_approval_for_new_channel,require_approval_for_new_audience,
        require_approval_for_price_claims,timezone,updated_by_user_id)
     VALUES ($1,'autonomous',FALSE,500000,500000,500000,$2,FALSE,FALSE,FALSE,'Europe/London',$3)`,
    [E2E.organizationId, JSON.stringify(['content','social','email','advertising','seo','analytics']), E2E.userId]
  );
  await client.query(
    `INSERT INTO generation_credit_wallets
       (organization_id,wallet_type,available_credits,lifetime_granted_credits)
     VALUES ($1,'internal',500000,500000)`,
    [E2E.organizationId]
  );
  await client.query(
    `INSERT INTO studio_assets
       (id,organization_id,user_id,filename,original_name,mime_type,size_bytes,storage_path,url,metadata)
     VALUES ($1,$2,$3,'acceptance-brand-logo.svg','acceptance-brand-logo.svg','image/svg+xml',$4,$5,$6,$7)`,
    [E2E.brandLogoAssetId, E2E.organizationId, E2E.userId, brandLogoStat.size, brandLogoPath, `/api/v1/studio/assets/${E2E.brandLogoAssetId}`, JSON.stringify({ role: 'tenant_brand_logo', candidate_fixture: true })]
  );
  await client.query(
    `INSERT INTO brand_dna
       (organization_id,company_name,industry,brand_voice,target_audience,goals,keywords,
        writing_style,prohibited_phrases,preferred_ctas,colors,company_description,
        website_url,products,tone,compliance_rules,logo_url,social_handles,competitors)
     VALUES ($1,'Acceptance Equine','Equestrian education','Clear, warm and evidence-led',$2,$3,$4,
       'Plain English with useful specifics',$5,$6,$7,
       'Practical equestrian learning and responsible products.','https://example.test',$8,
       'professional',$9,$10,'{}','[]')`,
    [
      E2E.organizationId,
      JSON.stringify({ demographics: 'UK horse owners and riders', psychographics: 'Safety-conscious lifelong learners' }),
      JSON.stringify(['Grow qualified Academy enrolments']),
      JSON.stringify(['horse care','rider education']),
      JSON.stringify(['guaranteed outcome']),
      JSON.stringify(['Explore the Academy']),
      JSON.stringify({ primary: '#123456', secondary: '#ffffff', accent: '#abcdef' }),
      JSON.stringify(['Academy','Shop']),
      JSON.stringify(['Use verified claims only']),
      `/api/v1/studio/assets/${E2E.brandLogoAssetId}`,
    ]
  );
  await client.query(
    `INSERT INTO content_items
       (id,organization_id,title,body,type,platform,status,workflow_state,word_count,
        quality_score,ai_generated,version,created_by)
     VALUES ($1,$2,'Owner review acceptance item','A grounded campaign draft for owner review.','social','linkedin','review','in_review',8,92,FALSE,1,$3)`,
    [E2E.contentId, E2E.organizationId, E2E.userId]
  );
  await client.query(
    `INSERT INTO content_approvals (content_id,organization_id,status,assigned_to,approved_content_hash)
     VALUES ($1,$2,'pending',$3,NULL)`,
    [E2E.contentId, E2E.organizationId, E2E.userId]
  );

  const models = [
    ['gpt-5.6-luna','Amarktai Text','text',['chat'],['text'],['text']],
    ['e2e-image-model','Amarktai Image','image',['text_to_image'],['text'],['image']],
    ['e2e-video-model','Amarktai Video','video',['text_to_video'],['text'],['video']],
  ];
  for (const [id,name,category,operations,inputs,outputs] of models) {
    await client.query(
      `INSERT INTO genx_models
         (id,name,vendor,category,operations,inputs,outputs,status,available,deprecated,
          verification_status,retail_enabled,pricing_status,pricing_last_synced_at,parameters)
       VALUES ($1,$2,'e2e-provider-boundary',$3,$4,$5,$6,'available',TRUE,FALSE,
         'runtime_confirmed',TRUE,'priced',NOW(),'{}')
       ON CONFLICT (id) DO UPDATE SET available=TRUE,deprecated=FALSE,verification_status='runtime_confirmed',
         retail_enabled=TRUE,pricing_status='priced',pricing_last_synced_at=NOW()`,
      [id,name,category,JSON.stringify(operations),JSON.stringify(inputs),JSON.stringify(outputs)]
    );
  }

  const prices = [
    ['gpt-5.6-luna','text_input','thousand_tokens',0.0001,0.0002],
    ['gpt-5.6-luna','text_output','thousand_tokens',0.0002,0.0004],
    ['e2e-image-model','text_to_image','request',0.01,0.02],
    ['e2e-video-model','text_to_video','second',0.001,0.002],
  ];
  for (const [modelId,operation,unit,wholesale,retail] of prices) {
    await client.query(
      `INSERT INTO genx_price_snapshots
         (model_id,operation,billable_unit,source_currency,source_unit_cost,fx_rate_to_gbp,
          wholesale_unit_cost_gbp,target_margin_bps,retail_unit_cost_gbp,credits_per_unit,
          pricing_source,agent_tier_applied,raw_metadata)
       VALUES ($1,$2,$3,'GBP',$4,1,$4,5000,$5,1,'admin_override',FALSE,$6)`,
      [modelId,operation,unit,wholesale,retail,JSON.stringify({ test_provider_boundary: true })]
    );
  }
  await client.query('COMMIT');
  console.log(`E2E_SEED=${JSON.stringify({status:'PASS',email:E2E.email,organization_id:E2E.organizationId})}`);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
