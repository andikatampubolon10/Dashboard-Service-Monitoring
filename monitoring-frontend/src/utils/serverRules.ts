import { Server, Service, PlacementRuleResult, ServerComplianceSummary } from '../types';

/**
 * 5 Aturan Baku Penggabungan & Penempatan Service ke dalam Server Host
 */
export const OFFICIAL_PLACEMENT_RULES = [
  {
    id: 'RULE-CAPACITY',
    title: 'Aturan 1: Batas Kapasitas Slot (Max Slot Limit)',
    category: 'Kapasitas',
    description: 'Setiap server node memiliki kuota slot maksimum service (misal 3 atau 4 slot). Tidak diizinkan menambah service melebihi batas slot yang tersedia.',
    strictness: 'Strict (Wajib Lolos)',
  },
  {
    id: 'RULE-ENV-ISOLATION',
    title: 'Aturan 2: Isolasi Environment (Environment Isolation)',
    category: 'Stabilitas & Keamanan',
    description: 'Service ber-environment PRODUCTION hanya boleh berjalan di server PRODUCTION. Tidak diizinkan mencampur service STAGING/DEV ke host Production untuk mencegah kontaminasi data.',
    strictness: 'Strict (Wajib Lolos)',
  },
  {
    id: 'RULE-STACK-COMPATIBILITY',
    title: 'Aturan 3: Kompatibilitas Runtime Stack',
    category: 'Infrastruktur',
    description: 'Host yang dikhususkan untuk runtime tertentu (misal: Go native host atau Node.js worker) harus cocok dengan stack microservice yang ditempatkan.',
    strictness: 'Warning / Strict',
  },
  {
    id: 'RULE-ANTI-COLOCATION',
    title: 'Aturan 4: Isolasi Keamanan & Anti-Colocation Beban Kritis',
    category: 'Keamanan Data & HA',
    description: 'Service data sensitif (seperti Identity/Auth, Medical Record, dan Audit) dilarang digabung pada server yang sama dengan service komputasi berat AI (AI Consultation) demi mencegah resource exhaustion dan kebocoran proses.',
    strictness: 'Strict (Wajib Lolos)',
  },
  {
    id: 'RULE-RESOURCE-HEADROOM',
    title: 'Aturan 5: Ambang Batas Aman Resource (Memory & CPU Headroom)',
    category: 'Kesehatan Host',
    description: 'Server yang memiliki utilisasi memori atau CPU di atas batas aman (>80-85%) tidak boleh dipasangi service baru untuk mencegah Out-Of-Memory (OOM) Crash pada host.',
    strictness: 'Strict (Wajib Lolos)',
  },
];

/**
 * Validasi apakah suatu service boleh digabungkan ke dalam server target
 */
export function validateServicePlacement(
  server: Server,
  serviceToAdd: Service,
  currentServices: Service[]
): {
  allowed: boolean;
  results: PlacementRuleResult[];
  blockingReasons: string[];
} {
  const results: PlacementRuleResult[] = [];
  const maxCap = server.maxCapacity || 4;
  const currentCount = currentServices.length;

  // ─── Rule 1: Capacity Limit ──────────────────────────────────────────────
  const alreadyInServer = currentServices.some((s) => s.id === serviceToAdd.id);
  if (!alreadyInServer && currentCount >= maxCap) {
    results.push({
      ruleId: 'RULE-CAPACITY',
      title: 'Batas Kapasitas Slot',
      description: `Maksimum kuota slot service pada server ini adalah ${maxCap}.`,
      passed: false,
      severity: 'error',
      message: `Slot server penuh (${currentCount}/${maxCap}). Tidak dapat menambahkan service baru.`,
    });
  } else {
    results.push({
      ruleId: 'RULE-CAPACITY',
      title: 'Batas Kapasitas Slot',
      description: `Slot tersedia (${currentCount}/${maxCap}).`,
      passed: true,
      severity: 'info',
      message: `Slot tersedia: ${currentCount + (alreadyInServer ? 0 : 1)} dari ${maxCap} slot terpakai.`,
    });
  }

  // ─── Rule 2: Environment Isolation ───────────────────────────────────────
  const serverEnv = (server.env || 'PRODUCTION').toUpperCase();
  const serviceEnv = (serviceToAdd.env || 'PRODUCTION').toUpperCase();

  if (serverEnv !== serviceEnv) {
    results.push({
      ruleId: 'RULE-ENV-ISOLATION',
      title: 'Isolasi Environment',
      description: 'Environment service harus sama persis dengan environment server host.',
      passed: false,
      severity: 'error',
      message: `Pelanggaran Environment: Service ber-environment ${serviceEnv} tidak boleh digabung ke server ${serverEnv}.`,
    });
  } else {
    results.push({
      ruleId: 'RULE-ENV-ISOLATION',
      title: 'Isolasi Environment',
      description: `Cocok: Sama-sama berada pada environment ${serverEnv}.`,
      passed: true,
      severity: 'info',
      message: `Kesesuaian environment terverifikasi (${serverEnv}).`,
    });
  }

  // ─── Rule 3: Stack Compatibility ─────────────────────────────────────────
  if (server.allowedStacks && server.allowedStacks.length > 0 && serviceToAdd.stack) {
    const isStackAllowed = server.allowedStacks.includes(serviceToAdd.stack);
    if (!isStackAllowed) {
      results.push({
        ruleId: 'RULE-STACK-COMPATIBILITY',
        title: 'Kompatibilitas Runtime Stack',
        description: `Host ini mendukung stack [${server.allowedStacks.join(', ')}].`,
        passed: false,
        severity: 'warning',
        message: `Stack ${serviceToAdd.stack.toUpperCase()} tidak disarankan pada server khusus stack [${server.allowedStacks.join(', ')}].`,
      });
    } else {
      results.push({
        ruleId: 'RULE-STACK-COMPATIBILITY',
        title: 'Kompatibilitas Runtime Stack',
        description: `Stack ${serviceToAdd.stack.toUpperCase()} didukung oleh server host.`,
        passed: true,
        severity: 'info',
        message: `Runtime stack kompatibel (${serviceToAdd.stack}).`,
      });
    }
  } else {
    results.push({
      ruleId: 'RULE-STACK-COMPATIBILITY',
      title: 'Kompatibilitas Runtime Stack',
      description: 'Host mendukung multi-runtime container.',
      passed: true,
      severity: 'info',
      message: 'Runtime multi-stack didukung.',
    });
  }

  // ─── Rule 4: Anti-Colocation / Security Isolation ────────────────────────
  const sensitiveServiceIds = ['identity', 'identity-service', 'medical-record', 'medical-record-service', 'audit', 'audit-service'];
  const heavyAiServiceIds = ['ai-consultation', 'ai-consultation-service'];

  const isAddingSensitive = sensitiveServiceIds.includes(serviceToAdd.id);
  const isAddingAi = heavyAiServiceIds.includes(serviceToAdd.id);
  const hostHasSensitive = currentServices.some((s) => sensitiveServiceIds.includes(s.id));
  const hostHasAi = currentServices.some((s) => heavyAiServiceIds.includes(s.id));

  if ((isAddingAi && hostHasSensitive) || (isAddingSensitive && hostHasAi)) {
    results.push({
      ruleId: 'RULE-ANTI-COLOCATION',
      title: 'Isolasi Keamanan & Anti-Colocation',
      description: 'Service komputasi berat AI dilarang satu host dengan service Auth/Sensitif.',
      passed: false,
      severity: 'error',
      message: `Konflik Anti-Colocation: Service AI Consultation komputasi berat tidak boleh digabung dengan Service Sensitif (Identity/Rekam Medis) pada host yang sama.`,
    });
  } else {
    results.push({
      ruleId: 'RULE-ANTI-COLOCATION',
      title: 'Isolasi Keamanan & Anti-Colocation',
      description: 'Tidak ada konflik isolasi keamanan data atau beban komputasi.',
      passed: true,
      severity: 'info',
      message: 'Tidak ada konflik anti-colocation keamanan.',
    });
  }

  // ─── Rule 5: Resource Headroom Threshold ──────────────────────────────────
  const memPercent = server.memoryTotalBytes > 0
    ? Math.round((server.memoryUsedBytes / server.memoryTotalBytes) * 100)
    : 0;
  const cpuPercent = Math.round(server.cpuUsagePercent || 0);

  if (memPercent >= 85 || cpuPercent >= 85 || server.status === 'critical') {
    results.push({
      ruleId: 'RULE-RESOURCE-HEADROOM',
      title: 'Ambang Batas Aman Resource',
      description: 'Penggunaan memori / CPU host di atas batas aman 85%.',
      passed: false,
      severity: 'error',
      message: `Resource Host Kritis (RAM ${memPercent}%, CPU ${cpuPercent}%). Penambahan service baru diblokir untuk mencegah OOM Crash.`,
    });
  } else if (memPercent >= 75 || cpuPercent >= 75 || server.status === 'degraded') {
    results.push({
      ruleId: 'RULE-RESOURCE-HEADROOM',
      title: 'Ambang Batas Aman Resource',
      description: 'Host berstatus degraded atau memori mendekati batas aman (>75%).',
      passed: true,
      severity: 'warning',
      message: `Peringatan: Utilisasi host tinggi (RAM ${memPercent}%, CPU ${cpuPercent}%). Pastikan service baru memiliki footprint memori rendah.`,
    });
  } else {
    results.push({
      ruleId: 'RULE-RESOURCE-HEADROOM',
      title: 'Ambang Batas Aman Resource',
      description: `Resource host dalam batas aman (RAM ${memPercent}%, CPU ${cpuPercent}%).`,
      passed: true,
      severity: 'info',
      message: `Headroom resource mencukupi (RAM ${memPercent}%, CPU ${cpuPercent}%).`,
    });
  }

  const errors = results.filter((r) => !r.passed && r.severity === 'error');
  const allowed = errors.length === 0;
  const blockingReasons = errors.map((e) => e.message);

  return {
    allowed,
    results,
    blockingReasons,
  };
}

/**
 * Evaluasi status kepatuhan server saat ini terhadap seluruh aturan penggabungan
 */
export function evaluateServerCompliance(
  server: Server,
  currentServices: Service[]
): ServerComplianceSummary {
  const maxCap = server.maxCapacity || 4;
  const currentCount = currentServices.length;
  const violations: string[] = [];
  const warnings: string[] = [];
  const rulesEvaluated: PlacementRuleResult[] = [];

  // 1. Capacity
  if (currentCount > maxCap) {
    const msg = `Over Capacity: Menampung ${currentCount} service melampaui kuota ${maxCap} slot.`;
    violations.push(msg);
    rulesEvaluated.push({
      ruleId: 'RULE-CAPACITY',
      title: 'Batas Kapasitas Slot',
      description: 'Host kelebihan muatan service.',
      passed: false,
      severity: 'error',
      message: msg,
    });
  } else if (currentCount === maxCap) {
    warnings.push(`Kapasitas Penuh: Kuota slot telah terisi maksimal (${currentCount}/${maxCap}).`);
    rulesEvaluated.push({
      ruleId: 'RULE-CAPACITY',
      title: 'Batas Kapasitas Slot',
      description: 'Host terisi penuh.',
      passed: true,
      severity: 'warning',
      message: `Slot penuh (${currentCount}/${maxCap}).`,
    });
  } else {
    rulesEvaluated.push({
      ruleId: 'RULE-CAPACITY',
      title: 'Batas Kapasitas Slot',
      description: 'Slot dalam batas aman.',
      passed: true,
      severity: 'info',
      message: `Tersedia ${maxCap - currentCount} slot kosong (${currentCount}/${maxCap}).`,
    });
  }

  // 2. Environment Isolation
  const serverEnv = (server.env || 'PRODUCTION').toUpperCase();
  const mismatchedEnvs = currentServices.filter(
    (s) => (s.env || 'PRODUCTION').toUpperCase() !== serverEnv
  );
  if (mismatchedEnvs.length > 0) {
    const msg = `Pelanggaran Environment: Ada ${mismatchedEnvs.length} service (${mismatchedEnvs.map((s) => s.name).join(', ')}) dengan environment berbeda dari host (${serverEnv}).`;
    violations.push(msg);
    rulesEvaluated.push({
      ruleId: 'RULE-ENV-ISOLATION',
      title: 'Isolasi Environment',
      description: 'Ditemukan service non-matching environment pada host ini.',
      passed: false,
      severity: 'error',
      message: msg,
    });
  } else {
    rulesEvaluated.push({
      ruleId: 'RULE-ENV-ISOLATION',
      title: 'Isolasi Environment',
      description: 'Seluruh service sesuai dengan environment server.',
      passed: true,
      severity: 'info',
      message: `Semua service terisolasi pada environment ${serverEnv}.`,
    });
  }

  // 3. Stack Compatibility
  if (server.allowedStacks && server.allowedStacks.length > 0) {
    const invalidStackServices = currentServices.filter(
      (s) => s.stack && !server.allowedStacks!.includes(s.stack)
    );
    if (invalidStackServices.length > 0) {
      const msg = `Inkompatibilitas Stack: ${invalidStackServices.map((s) => s.name).join(', ')} menggunakan runtime di luar [${server.allowedStacks.join(', ')}].`;
      warnings.push(msg);
      rulesEvaluated.push({
        ruleId: 'RULE-STACK-COMPATIBILITY',
        title: 'Kompatibilitas Runtime Stack',
        description: 'Ada service dengan stack yang berbeda.',
        passed: false,
        severity: 'warning',
        message: msg,
      });
    } else {
      rulesEvaluated.push({
        ruleId: 'RULE-STACK-COMPATIBILITY',
        title: 'Kompatibilitas Runtime Stack',
        description: 'Semua service cocok dengan stack host.',
        passed: true,
        severity: 'info',
        message: `Stack kompatibel dengan [${server.allowedStacks.join(', ')}].`,
      });
    }
  }

  // 4. Anti-Colocation
  const sensitiveServiceIds = ['identity', 'identity-service', 'medical-record', 'medical-record-service', 'audit', 'audit-service'];
  const heavyAiServiceIds = ['ai-consultation', 'ai-consultation-service'];

  const hasSensitive = currentServices.some((s) => sensitiveServiceIds.includes(s.id));
  const hasAi = currentServices.some((s) => heavyAiServiceIds.includes(s.id));

  if (hasSensitive && hasAi) {
    const msg = 'Pelanggaran Anti-Colocation: Host ini menggabungkan AI Consultation dan Service Sensitif (Identity/Rekam Medis).';
    violations.push(msg);
    rulesEvaluated.push({
      ruleId: 'RULE-ANTI-COLOCATION',
      title: 'Isolasi Keamanan & Anti-Colocation',
      description: 'Ditemukan colocation terlarang antara AI compute dan sensitive data.',
      passed: false,
      severity: 'error',
      message: msg,
    });
  } else {
    rulesEvaluated.push({
      ruleId: 'RULE-ANTI-COLOCATION',
      title: 'Isolasi Keamanan & Anti-Colocation',
      description: 'Tidak ada konflik anti-colocation pada host.',
      passed: true,
      severity: 'info',
      message: 'Aturan anti-colocation terpenuhi.',
    });
  }

  // 5. Resource Headroom
  const memPercent = server.memoryTotalBytes > 0
    ? Math.round((server.memoryUsedBytes / server.memoryTotalBytes) * 100)
    : 0;

  if (memPercent >= 85 || server.status === 'critical') {
    const msg = `Memori Host Kritis (${memPercent}%): Melebihi batas aman 85%. Berisiko OOM Crash.`;
    warnings.push(msg);
    rulesEvaluated.push({
      ruleId: 'RULE-RESOURCE-HEADROOM',
      title: 'Ambang Batas Aman Resource',
      description: 'Memori kritis.',
      passed: false,
      severity: 'warning',
      message: msg,
    });
  } else {
    rulesEvaluated.push({
      ruleId: 'RULE-RESOURCE-HEADROOM',
      title: 'Ambang Batas Aman Resource',
      description: 'Resource dalam batas aman.',
      passed: true,
      severity: 'info',
      message: `Memori terkontrol pada ${memPercent}%.`,
    });
  }

  let status: 'compliant' | 'warning' | 'violation' = 'compliant';
  if (violations.length > 0) {
    status = 'violation';
  } else if (warnings.length > 0) {
    status = 'warning';
  }

  return {
    status,
    isCompliant: violations.length === 0,
    violations,
    warnings,
    rulesEvaluated,
  };
}
