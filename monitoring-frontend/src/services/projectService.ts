import { Project, ProjectPayload, ProjectAlertItem } from '../types';

const API_BASE_URL =
  import.meta.env.VITE_MONITORING_API_URL !== undefined
    ? import.meta.env.VITE_MONITORING_API_URL.replace(/\/$/, '')
    : (import.meta.env.DEV ? 'http://localhost:5000' : '');

export class ProjectService {
  public static async getProjects(): Promise<Project[]> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.projects || [];
    } catch (err) {
      console.warn('[ProjectService] Failed to get projects:', err);
      return [];
    }
  }

  public static async getProjectById(id: string): Promise<Project | null> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/${encodeURIComponent(id)}`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.project || null;
    } catch (err) {
      console.warn(`[ProjectService] Failed to get project ${id}:`, err);
      return null;
    }
  }

  public static async createProject(payload: ProjectPayload): Promise<Project> {
    const res = await fetch(`${API_BASE_URL}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data.project;
  }

  public static async updateProject(id: string, payload: ProjectPayload): Promise<Project> {
    const res = await fetch(`${API_BASE_URL}/api/projects/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data.project;
  }

  public static async deleteProject(id: string): Promise<boolean> {
    const res = await fetch(`${API_BASE_URL}/api/projects/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return true;
  }

  public static async addServerToProject(projectId: string, serverId: string): Promise<Project> {
    const res = await fetch(`${API_BASE_URL}/api/projects/${encodeURIComponent(projectId)}/servers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ serverId }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data.project;
  }

  public static async removeServerFromProject(projectId: string, serverId: string): Promise<Project> {
    const res = await fetch(
      `${API_BASE_URL}/api/projects/${encodeURIComponent(projectId)}/servers/${encodeURIComponent(serverId)}`,
      {
        method: 'DELETE',
        headers: { Accept: 'application/json' },
      }
    );

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data.project;
  }

  public static async getProjectAiInsight(projectId: string, forceRefresh = false): Promise<import('../types').ProjectAiInsight | null> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/${encodeURIComponent(projectId)}/ai-insight`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ forceRefresh }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.data || null;
    } catch (err) {
      console.warn(`[ProjectService] Failed to get AI insight for ${projectId}:`, err);
      return null;
    }
  }

  // ─── SLACK ALERT INTEGRATION METHODS ───────────────────────────────────────

  public static async testSlackWebhook(webhookUrl: string, channelLabel = '#alerts'): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE_URL}/api/projects/test-webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ webhookUrl, channelLabel }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Gagal menguji Webhook Slack.');
    }
    return data;
  }

  public static async getProjectAlerts(projectId: string): Promise<ProjectAlertItem[]> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/${encodeURIComponent(projectId)}/alerts`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.alerts || [];
    } catch (err) {
      console.warn(`[ProjectService] Failed to get alerts for project ${projectId}:`, err);
      return [];
    }
  }

  public static async addProjectAlert(projectId: string, alertData: Partial<ProjectAlertItem>): Promise<ProjectAlertItem> {
    const res = await fetch(`${API_BASE_URL}/api/projects/${encodeURIComponent(projectId)}/alerts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(alertData),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Gagal menambahkan alert rule.');
    }
    return data.alert;
  }

  public static async updateProjectAlert(projectId: string, alertId: string, alertData: Partial<ProjectAlertItem>): Promise<ProjectAlertItem> {
    const res = await fetch(`${API_BASE_URL}/api/projects/${encodeURIComponent(projectId)}/alerts/${encodeURIComponent(alertId)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(alertData),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Gagal memperbarui alert rule.');
    }
    return data.alert;
  }

  public static async deleteProjectAlert(projectId: string, alertId: string): Promise<boolean> {
    const res = await fetch(`${API_BASE_URL}/api/projects/${encodeURIComponent(projectId)}/alerts/${encodeURIComponent(alertId)}`, {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Gagal menghapus alert rule.');
    }
    return true;
  }

  public static async toggleProjectAlert(projectId: string, alertId: string, isEnabled: boolean): Promise<ProjectAlertItem> {
    const res = await fetch(`${API_BASE_URL}/api/projects/${encodeURIComponent(projectId)}/alerts/${encodeURIComponent(alertId)}/toggle`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ isEnabled }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Gagal mengubah status alert.');
    }
    return data.alert;
  }

  public static async getProjectAlertHistory(projectId: string): Promise<any[]> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/${encodeURIComponent(projectId)}/alert-history`, {
        headers: { Accept: 'application/json' },
      });
      const data = await res.json();
      return Array.isArray(data.history) ? data.history : [];
    } catch {
      return [];
    }
  }

  public static async triggerTestAlert(
    projectId: string,
    params?: { targetType?: string; targetName?: string; errorMessage?: string }
  ): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE_URL}/api/projects/${encodeURIComponent(projectId)}/trigger-test-alert`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(params || {}),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Gagal memicu simulasi alert.');
    }
    return data;
  }
}
