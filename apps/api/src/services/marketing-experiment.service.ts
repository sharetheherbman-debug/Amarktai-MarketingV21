import { query } from '../config/database';
import { AppError, NotFoundError } from '../middleware/errorHandler';

function variants(value: unknown): Array<{ id: string; label?: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    const id = String(row.id || '').trim();
    return id ? [{ id, label: row.label ? String(row.label) : undefined }] : [];
  });
}

export async function createExperiment(organizationId: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const experimentVariants = variants(input.variants);
  const requestedMinimum = Number(input.minimum_sample_size ?? 50);
  const requestedDuration = Number(input.max_duration_days ?? 30);
  if (!String(input.name || '').trim() || !String(input.hypothesis || '').trim() || !String(input.success_metric || '').trim()) {
    throw new AppError(400, 'name, hypothesis, and success_metric are required', 'EXPERIMENT_INVALID');
  }
  if (experimentVariants.length < 2 || new Set(experimentVariants.map((variant) => variant.id)).size !== experimentVariants.length) {
    throw new AppError(400, 'At least two uniquely identified variants are required', 'EXPERIMENT_VARIANTS_INVALID');
  }
  if (!Number.isFinite(requestedMinimum) || !Number.isFinite(requestedDuration)) {
    throw new AppError(400, 'Experiment limits must be finite numbers', 'EXPERIMENT_LIMITS_INVALID');
  }
  const result = await query(
    `INSERT INTO marketing_experiments
       (organization_id,campaign_id,name,variable_type,hypothesis,status,success_metric,variants,
        stop_conditions,minimum_sample_size,max_duration_days,started_at)
     VALUES ($1,$2,$3,$4,$5,'running',$6,$7,$8,$9,$10,NOW()) RETURNING *`,
    [organizationId, input.campaign_id || null, String(input.name).trim(), String(input.variable_type || 'content'),
      String(input.hypothesis).trim(), String(input.success_metric).trim(), JSON.stringify(experimentVariants),
      JSON.stringify(input.stop_conditions || {}), Math.max(1, Math.floor(requestedMinimum)),
      Math.max(1, Math.min(Math.floor(requestedDuration), 365))]
  );
  return result.rows[0];
}

export async function listExperiments(organizationId: string): Promise<Record<string, unknown>[]> {
  return (await query('SELECT * FROM marketing_experiments WHERE organization_id=$1 ORDER BY created_at DESC', [organizationId])).rows;
}

export async function evaluateExperiment(id: string, organizationId: string): Promise<Record<string, unknown>> {
  const result = await query('SELECT * FROM marketing_experiments WHERE id=$1 AND organization_id=$2', [id, organizationId]);
  if (result.rows.length === 0) throw new NotFoundError('Experiment');
  const experiment = result.rows[0];
  const experimentVariants = variants(typeof experiment.variants === 'string' ? JSON.parse(experiment.variants) : experiment.variants);
  const metric = String(experiment.success_metric);
  const observations = await query(
    `SELECT variation_id,COUNT(*)::int AS sample_size,
            SUM(CASE WHEN $3='value_pence' THEN value_pence::numeric
                     ELSE COALESCE(NULLIF(metrics->>$3,'')::numeric,0) END) AS metric_total
     FROM marketing_performance_events
     WHERE organization_id=$1 AND variation_id=ANY($2::text[])
       AND occurred_at>=COALESCE($4::timestamptz,created_at)
     GROUP BY variation_id`,
    [organizationId, experimentVariants.map((variant) => variant.id), metric, experiment.started_at]
  );
  const byVariant = new Map(observations.rows.map((row) => [String(row.variation_id), row]));
  const results = experimentVariants.map((variant) => {
    const row = byVariant.get(variant.id);
    const sampleSize = Number(row?.sample_size || 0);
    const total = Number(row?.metric_total || 0);
    return { ...variant, sample_size: sampleSize, metric_total: total, metric_per_observation: sampleSize > 0 ? total / sampleSize : 0 };
  });
  const minimum = Number(experiment.minimum_sample_size || 50);
  const eligible = results.filter((row) => row.sample_size >= minimum);
  const elapsedDays = experiment.started_at ? (Date.now() - new Date(experiment.started_at).getTime()) / 86400000 : 0;
  const reachedDuration = elapsedDays >= Number(experiment.max_duration_days || 30);
  const winner = eligible.length === experimentVariants.length
    ? [...eligible].sort((left, right) => right.metric_per_observation - left.metric_per_observation)[0]
    : null;
  const conclusive = Boolean(winner) && (reachedDuration || results.every((row) => row.sample_size >= minimum));
  const conclusion = {
    conclusive,
    reason: conclusive ? 'All variants met the declared sample threshold' : 'Insufficient evidence; no winner declared',
    metric,
    results,
    evaluated_at: new Date().toISOString(),
  };
  if (conclusive && winner) {
    await query(
      `UPDATE marketing_experiments SET status='completed',winner_variant=$1,conclusion=$2,ended_at=NOW() WHERE id=$3 AND organization_id=$4`,
      [winner.id, JSON.stringify(conclusion), id, organizationId]
    );
  } else if (reachedDuration) {
    conclusion.reason = 'Maximum duration reached without every variant meeting the declared sample threshold';
    await query(
      `UPDATE marketing_experiments SET status='inconclusive',conclusion=$1,ended_at=NOW() WHERE id=$2 AND organization_id=$3`,
      [JSON.stringify(conclusion), id, organizationId]
    );
  } else {
    await query('UPDATE marketing_experiments SET conclusion=$1 WHERE id=$2 AND organization_id=$3', [JSON.stringify(conclusion), id, organizationId]);
  }
  return conclusion;
}
