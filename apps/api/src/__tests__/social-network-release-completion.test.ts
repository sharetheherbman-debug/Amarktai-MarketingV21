import fs from 'fs';
import path from 'path';

const apiRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(apiRoot, '../../..');
const read = (relative: string) => fs.readFileSync(path.join(repoRoot, relative), 'utf8');

describe('social network and release completion invariants', () => {
  test('routes all completed network adapters through the exact approval delivery boundary', () => {
    const strict = read('apps/api/src/services/strict-social-delivery.service.ts');
    expect(strict).toContain('isExtendedSocialPlatform');
    expect(strict).toContain('publishExtendedSocialPost');
    expect(strict).toContain('isNativeEnhancedPlatform');
    expect(strict).toContain('publishNativeEnhancedPost');
    expect(strict).toContain("platform !== 'bluesky'");
    expect(strict).toContain('combined.slice(0, 300)');
  });

  test('keeps TikTok provider approval and creator consent fail-closed', () => {
    const extended = read('apps/api/src/services/extended-social-platform.service.ts');
    expect(extended).toContain('creator_consent_confirmed');
    expect(extended).toContain('TIKTOK_CREATOR_CONSENT_REQUIRED');
    expect(extended).toContain('/v2/post/publish/creator_info/query/');
    expect(extended).toContain('/v2/post/publish/video/init/');
    expect(extended).toContain('/v2/post/publish/content/init/');
    expect(extended).toContain('/v2/post/publish/status/fetch/');
  });

  test('implements native media workflows without bypassing the safe fetch boundary', () => {
    const native = read('apps/api/src/services/native-social-platform.service.ts');
    for (const expected of [
      'https://api.x.com/2/media/upload',
      "payload.media = { media_ids",
      "media_type', 'REELS'",
      "media_type: 'CAROUSEL'",
      '/threads_publish',
      "media_type: 'video'",
      "source_type: 'video_id'",
      'ai_disclosures',
      'safeFetch(url',
      'validatePublicHttpUrl',
    ]) expect(native).toContain(expected);
  });

  test('synchronizes provider performance into autonomous attribution', () => {
    const performance = read('apps/api/src/services/social-performance.service.ts');
    const extended = read('apps/api/src/services/extended-social-platform.service.ts');
    const scheduler = read('apps/api/src/services/scheduler.service.ts');
    for (const platform of ['x','linkedin','facebook','instagram','threads','pinterest','reddit','youtube']) {
      expect(performance).toContain(`platform === '${platform}'`);
    }
    expect(performance).toContain('fetchExtendedSocialMetrics');
    for (const platform of ['tiktok','bluesky','mastodon','telegram']) {
      expect(extended).toContain(`platform === '${platform}'`);
    }
    expect(performance).toContain('marketing_performance_events');
    expect(performance).toContain("'social_performance_snapshot'");
    expect(extended).toContain("if (platform === 'telegram') return null");
    expect(scheduler).toContain('sync-organic-social-performance');
    expect(scheduler).toContain('syncPublishedSocialPerformance');
  });

  test('uses additive social provider state migration', () => {
    const migration = read('apps/api/src/db/migrations/032_social_network_completion.sql');
    for (const expected of [
      'ALTER TABLE social_posts', 'provider_submission_id', 'last_metrics_sync_at',
      'ALTER TABLE social_connections', 'provider_capability_state',
      'CREATE TABLE IF NOT EXISTS social_performance_sync_events',
    ]) expect(migration).toContain(expected);
    expect(migration).not.toContain('DROP TABLE');
  });

  test('pins deployment to reviewed SHA and keeps first-run bootstrap explicit and fail-closed', () => {
    const gate = read('scripts/vps-release-gate.sh');
    const update = read('scripts/vps-update.sh');
    const env = read('.env.production.example');
    expect(gate).toContain('DEPLOY_SHA');
    expect(gate).toContain('does not equal reviewed DEPLOY_SHA');
    expect(gate).toContain('FIRST_RUN=true requires explicit ALLOW_FIRST_RUN_BOOTSTRAP=true');
    expect(gate).toContain('refusing accidental production bootstrap');
    expect(update).toContain('git checkout --detach "${reviewed_sha}"');
    expect(update).not.toContain('git pull --ff-only');
    expect(env).toContain('FIRST_RUN=false');
    expect(env).toContain('DEPLOY_SHA=replace-with-reviewed-marketing-sha');
  });

  test('deploys core first and stages every worker after provider acceptance', () => {
    const deploy = read('scripts/vps-deploy.sh');
    const smoke = read('scripts/vps-smoke.sh');
    expect(deploy).toContain('core|workers|full');
    expect(deploy).toContain('compose up -d api web nginx');
    expect(deploy).toContain('compose up -d generation-worker');
    expect(deploy).toContain('compose up -d longform-still-worker');
    expect(deploy).toContain('compose up -d render-worker');
    expect(smoke).toContain('worker-generation');
    expect(smoke).toContain('worker-longform');
    expect(smoke).toContain('wait_for_service longform-still-worker');
  });

  test('backup and restore cover Redis, encrypted environment, media and long-form worker state', () => {
    const backup = read('scripts/vps-backup.sh');
    const restore = read('scripts/vps-restore.sh');
    for (const expected of ['database.dump','redis.dump.rdb','uploads.tar.gz','production.env','manifest.env']) expect(backup).toContain(expected);
    expect(backup).toContain('openssl enc -aes-256-cbc');
    expect(backup).toContain('HOST_NGINX_CONFIG_PATH');
    expect(restore).toContain('redis.dump.rdb');
    expect(restore).toContain('longform-still-worker');
    expect(restore).toContain('Workers remain held after restore');
    expect(restore).toContain('RESTORE_WORKERS');
  });

  test('documents the real EquiProfile shared-host release topology and current migration tail', () => {
    const deployment = read('docs/DEPLOYMENT.md');
    const operations = read('docs/OPERATIONS.md');
    expect(deployment).toContain('marketing.equiprofile.online');
    expect(deployment).not.toContain('marketing.amarktai.co.za');
    expect(deployment).toContain('migration');
    expect(operations).toContain('generation-worker');
    expect(operations).toContain('longform-still-worker');
    expect(operations).toContain('render-worker');
  });
});
