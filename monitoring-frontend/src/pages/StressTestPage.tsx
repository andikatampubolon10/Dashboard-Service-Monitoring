/**
 * Re-export coordinator for backwards-compatibility.
 * The modular Stress Test implementation now lives in:
 * src/pages/stresstest/
 *  ├── StressTestProjectListPage.tsx (Daftar Projek Gateway)
 *  ├── StressTestStudioPage.tsx      (Studio Pengujian Beban Projek)
 *  └── index.tsx                     (Main Page Coordinator)
 */
export { default, StressTestPage } from "./stresstest";
