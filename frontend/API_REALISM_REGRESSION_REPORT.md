# API Realism Regression Report

## 1. Keyword Audit Results

- Command: `npm run audit:api-realism`
- Status: PASS
- Allowlist:
  - `*.stories.tsx`
  - `__tests__`
  - `src/pages/LocalAIDebugPage.tsx`

Additional checks:

- `rg -n "Mock Mode|mockMode|Math.random\\(" src/pages`: no matches

## 2. Data Source Evidence by Core Module

### Auth

- Login and token persistence:
  - `src/api/auth.ts` -> `api.auth.login` / `api.auth.me`
  - `src/lib/auth-store.ts` -> `setToken`, `setProfile`

### Dashboard (Learning Hub)

- Real dashboard summary:
  - `src/pages/LearningHubPage.tsx` -> `dashboardApi.get()`
- Real knowledge base list and file operations:
  - `src/pages/LearningHubPage.tsx` -> `knowledgeBaseApi.list/listFiles/uploadFile/deleteFile/create`
- Pending assignments aggregation from real APIs:
  - `src/pages/LearningHubPage.tsx` -> `courseApi.list()` + `assignmentApi.listByCourse()`

### Workspace / Simulation

- Real submission + polling with no mock fallback:
  - `src/hooks/useWorkspaceSimulation.ts`
- Real user-input payload (type/code/params):
  - `src/pages/Workspace.tsx`
  - `src/pages/WorkspaceHubPage.tsx`

### AI Chat (Cloud)

- SSE streaming from backend:
  - `src/lib/ai-stream.ts` -> `api.ai.streamChat`
  - shared client: `code/shared/src/sdk/ai.ts` (`/ai/chat`, SSE parsing)

### Knowledge Base / GraphRAG Contract

- Shared SDK expanded:
  - `code/shared/src/sdk/knowledgeBase.ts`
  - methods: `list`, `create`, `listFiles`, `uploadFile`, `deleteFile`, `reindex`
- Shared types expanded:
  - `code/shared/src/types/knowledge-base.ts`

## 3. Route and UX Risk Mitigation

- Course hub cards now navigate to real overview route:
  - `src/pages/CoursesHubPage.tsx`
- Legacy mock demo route isolated:
  - `src/app/router.tsx`
  - `/courses/:courseId/detail` -> redirect to `../overview`

## 4. Remaining Risks / Blockers

1. Knowledge base file APIs may not be fully available in backend environments.
   - Frontend behavior: explicit error display, no fake fallback.

2. Local model download/delete in AI Settings lacks real desktop IPC integration.
   - Frontend behavior: action buttons disabled with explicit "待接入" messaging.

3. Workspace result fidelity still depends on backend simulation output schema (`result.png_base64`).
   - Frontend behavior: strict error display + retry via run button.
