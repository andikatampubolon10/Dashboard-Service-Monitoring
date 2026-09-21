import { Project, ProjectPayload } from '../types';

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
}
