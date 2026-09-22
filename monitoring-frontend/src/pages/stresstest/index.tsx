import React, { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Project, Service } from "../../types";
import { ProjectService } from "../../services/projectService";
import { useServices } from "../../hooks/useServices";
import { useServers } from "../../hooks/useServers";
import { StressTestProjectListPage } from "./StressTestProjectListPage";
import { StressTestStudioPage } from "./StressTestStudioPage";

export const StressTestPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: servicesList } = useServices();
  const { data: serversList } = useServers();

  // Selected project is strictly URL-driven
  // If ?project=... is absent, display the project list gateway!
  const selectedProjectId = searchParams.get("project") || "";

  // Project List & Gateway States
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState<boolean>(true);

  // Detailed Active Project (fetches full server & service topology)
  const [activeProjectDetail, setActiveProjectDetail] = useState<Project | null>(null);

  // Load Projects on Mount
  const fetchProjects = async () => {
    setIsLoadingProjects(true);
    try {
      const list = await ProjectService.getProjects();
      setProjects(list);
    } catch (err) {
      console.error("Failed to load projects:", err);
    } finally {
      setIsLoadingProjects(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  // Fetch detailed project when selectedProjectId changes
  useEffect(() => {
    if (!selectedProjectId) {
      setActiveProjectDetail(null);
      return;
    }
    ProjectService.getProjectById(selectedProjectId).then((detail) => {
      if (detail) setActiveProjectDetail(detail);
    });
  }, [selectedProjectId]);

  // Resolve Active Project
  const activeProject = useMemo(() => {
    if (!selectedProjectId) return null;
    return activeProjectDetail || projects.find((p) => p.id === selectedProjectId) || null;
  }, [activeProjectDetail, projects, selectedProjectId]);

  // Resolve Services for Active Project
  const projectServices = useMemo(() => {
    // 1. Ambil dari server objects di dalam activeProject jika ada
    if (activeProject && activeProject.servers && activeProject.servers.length > 0) {
      const extracted: Service[] = [];
      activeProject.servers.forEach((srv) => {
        const svcs = (srv.services || (srv as any).servicesData || []) as any[];
        svcs.forEach((s) => {
          if (!extracted.some((item) => item.id === s.id)) {
            const globalMatch = servicesList?.find((g) => g.id === s.id);
            const resolvedUrl = (globalMatch?.url || s.url || (srv.host && s.port ? `http://${srv.host}:${s.port}` : "")).replace(/:\s*undefined/g, "");
            extracted.push({
              id: s.id,
              name: s.name,
              status: s.status || globalMatch?.status,
              rawStatus: s.rawStatus || s.status || globalMatch?.rawStatus,
              port: s.port || (globalMatch as any)?.port,
              url: resolvedUrl,
              endpoint: s.endpoint || s.metricsPath || (globalMatch as any)?.endpoint,
              metricsPath: s.metricsPath || (globalMatch as any)?.metricsPath,
              serverId: srv.id,
              serviceId: s.id,
            } as unknown as Service);
          }
        });
      });
      if (extracted.length > 0 && extracted.some((item) => item.url && !item.url.includes(":undefined"))) {
        return extracted;
      }
    }

    // 2. Filter dari global servicesList berdasarkan serverIds atau IP host target
    if (!servicesList || servicesList.length === 0) return [];
    if (!activeProject || !activeProject.serverIds || activeProject.serverIds.length === 0) {
      return servicesList;
    }
    const filtered = servicesList.filter((s) => {
      if (s.serverId && activeProject.serverIds.includes(s.serverId)) return true;
      if (activeProject.serverIds.some((srvId) => s.id.includes(srvId))) return true;
      if (s.url && (s.url.includes("34.101.122.171") || s.url.includes("34.101.207.115"))) return true;
      return false;
    });
    return filtered.length > 0 ? filtered : servicesList;
  }, [activeProject, servicesList]);

  // Resolve Servers for Active Project
  const projectServers = useMemo(() => {
    if (!activeProject || !serversList) return serversList || [];
    if (!activeProject.serverIds || activeProject.serverIds.length === 0) return serversList || [];
    return serversList.filter((srv) => activeProject.serverIds.includes(srv.id));
  }, [activeProject, serversList]);

  // Handle Project Selection from Gateway
  const handleSelectProject = (projectId: string) => {
    localStorage.setItem("stress_test_project_id", projectId);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("project", projectId);
    setSearchParams(nextParams);
  };

  // Handle Returning to Gateway
  const handleBackToProjectList = () => {
    localStorage.removeItem("stress_test_project_id");
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("project");
    setSearchParams(nextParams);
  };

  // ─── SCREEN 1: GATEWAY DAFTAR PROJEK (JIKA BELUM ADA PROJEK DIPILIH) ───
  if (!selectedProjectId || !activeProject) {
    return (
      <StressTestProjectListPage
        projects={projects}
        isLoading={isLoadingProjects}
        onRefresh={fetchProjects}
        onSelectProject={handleSelectProject}
        serversList={serversList || []}
      />
    );
  }

  // ─── SCREEN 2: STUDIO PENGUJIAN BEBAN UNTUK PROJEK TERPILIH ────────────
  return (
    <StressTestStudioPage
      activeProject={activeProject}
      projectServices={projectServices}
      projectServers={projectServers}
      onBackToProjectList={handleBackToProjectList}
    />
  );
};

export default StressTestPage;
