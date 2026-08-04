import { store, retrieve, search } from './memory.service';
import { Memory } from '../types';
import { logger } from '../utils/logger';

interface BusinessProfile {
  company_name?: string;
  industry?: string;
  description?: string;
  website?: string;
  target_audience?: {
    demographics?: string[];
    interests?: string[];
    pain_points?: string[];
  };
  brand_voice?: {
    tone?: string;
    style?: string;
    values?: string[];
    avoid?: string[];
  };
  goals?: {
    short_term?: string[];
    long_term?: string[];
    kpis?: string[];
  };
  competitors?: {
    name?: string;
    strengths?: string[];
    weaknesses?: string[];
  }[];
  products_services?: {
    name?: string;
    description?: string;
    price_range?: string;
  }[];
  unique_selling_points?: string[];
}

export async function storeBusinessProfile(orgId: string, data: BusinessProfile): Promise<Memory> {
  return store('business_profile', data as any, 'business', orgId, 'business');
}

export async function getBusinessProfile(orgId: string): Promise<BusinessProfile | null> {
  const memory = await retrieve('business_profile', orgId, 'business');
  return memory ? (memory.value as unknown as BusinessProfile) : null;
}

export async function updateBusinessProfile(orgId: string, data: Partial<BusinessProfile>): Promise<Memory> {
  const existing = await getBusinessProfile(orgId);
  const merged = { ...existing, ...data };
  return store('business_profile', merged as any, 'business', orgId, 'business');
}

export async function storeTargetAudience(orgId: string, data: BusinessProfile['target_audience']): Promise<Memory> {
  return store('target_audience', data as any, 'business', orgId, 'audience');
}

export async function getTargetAudience(orgId: string): Promise<BusinessProfile['target_audience'] | null> {
  const memory = await retrieve('target_audience', orgId, 'audience');
  return memory ? (memory.value as unknown as BusinessProfile['target_audience']) : null;
}

export async function storeBrandVoice(orgId: string, data: BusinessProfile['brand_voice']): Promise<Memory> {
  return store('brand_voice', data as any, 'brand', orgId, 'brand');
}

export async function getBrandVoice(orgId: string): Promise<BusinessProfile['brand_voice'] | null> {
  const memory = await retrieve('brand_voice', orgId, 'brand');
  return memory ? (memory.value as unknown as BusinessProfile['brand_voice']) : null;
}

export async function storeGoals(orgId: string, data: BusinessProfile['goals']): Promise<Memory> {
  return store('business_goals', data as any, 'business', orgId, 'goals');
}

export async function getGoals(orgId: string): Promise<BusinessProfile['goals'] | null> {
  const memory = await retrieve('business_goals', orgId, 'goals');
  return memory ? (memory.value as unknown as BusinessProfile['goals']) : null;
}

export async function storeCompetitors(orgId: string, data: BusinessProfile['competitors']): Promise<Memory> {
  return store('competitors', data as any, 'business', orgId, 'competitive');
}

export async function getCompetitors(orgId: string): Promise<BusinessProfile['competitors'] | null> {
  const memory = await retrieve('competitors', orgId, 'competitive');
  return memory ? (memory.value as unknown as BusinessProfile['competitors']) : null;
}

export async function getAllBusinessContext(orgId: string): Promise<Record<string, unknown>> {
  const [profile, audience, brandVoice, goals, competitors] = await Promise.all([
    getBusinessProfile(orgId),
    getTargetAudience(orgId),
    getBrandVoice(orgId),
    getGoals(orgId),
    getCompetitors(orgId),
  ]);

  return {
    profile,
    audience,
    brandVoice,
    goals,
    competitors,
  };
}
