/**
 * aiInsightService.ts
 * Client service to communicate with backend Gemini AI insight endpoint
 */

import { StressTestRecord } from './stressTestEngine';

export interface FlowComparisonItem {
  flowId: string;
  flowName: string;
  status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' | 'UNTESTED';
  p95LatencyMs: number;
  targetVUs: number;
  performanceCategory: string;
  comparisonNote: string;
  riskLevel: 'RENDAH' | 'SEDANG' | 'TINGGI';
}

export interface CapacityCeiling {
  maxSafeVU: number;
  warningVU?: number;
  breakingPointVU: number | null;
  limitingFactor: string;
  safeRangeText?: string;
  warningRangeText?: string;
  overloadRangeText?: string;
}

export interface ActionableRecommendation {
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  detail: string;
  domain: 'AI_ENGINE' | 'DATABASE' | 'CACHE' | 'NETWORK' | 'ARCHITECTURE';
}

export interface StressAiInsight {
  isAiGenerated: boolean;
  source: string;
  note?: string;
  verdict: 'STABLE' | 'DEGRADED' | 'CRITICAL';
  healthScore: number;
  headline: string;
  summary: string;
  flowComparison: FlowComparisonItem[];
  capacityCeiling: CapacityCeiling;
  actionableRecommendations: ActionableRecommendation[];
  analyzedAt: string;
  fromCache?: boolean;
}

export interface AiStatusResponse {
  isConfigured: boolean;
  model: string;
}

const BASE_URL =
  import.meta.env.VITE_MONITORING_API_URL !== undefined
    ? import.meta.env.VITE_MONITORING_API_URL.replace(/\/$/, '')
    : 'http://localhost:5000';

export async function fetchAiStatus(): Promise<AiStatusResponse> {
  try {
    const res = await fetch(`${BASE_URL}/api/stress-test/ai-insight/status`);
    if (!res.ok) throw new Error('Status check failed');
    const json = await res.json();
    return {
      isConfigured: Boolean(json.isConfigured),
      model: json.model || 'gemini-1.5-flash',
    };
  } catch {
    return { isConfigured: false, model: 'gemini-1.5-flash' };
  }
}

export async function fetchStressAiInsight(
  records: StressTestRecord[] = [],
  forceRefresh = false,
  projectName?: string,
  projectId?: string
): Promise<StressAiInsight | null> {
  try {
    const res = await fetch(`${BASE_URL}/api/stress-test/ai-insight`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        records,
        forceRefresh,
        projectName,
        projectId,
      }),
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch AI insight: HTTP ${res.status}`);
    }

    const json = await res.json();
    return json.data || null;
  } catch (err) {
    console.warn('[AI Insight Service] Request error:', err);
    return null;
  }
}
