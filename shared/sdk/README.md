# Shared SDK (Draft)

This folder is a placeholder for a shared API SDK that both web and mobile
can consume. The goal is to avoid duplicate endpoint wrappers and keep types
aligned with OpenAPI.

## Proposed structure

- sdk/
  - client.ts        // HTTP client abstraction (fetch/axios adapter)
  - endpoints/
    - auth.ts
    - course.ts
    - chapter.ts
    - assignment.ts
    - quiz.ts
    - resource.ts
    - ai.ts
    - writing.ts
    - stats.ts
  - index.ts         // barrel exports

## Notes

- Actual implementation should be generated or synced from OpenAPI.
- Keep the runtime dependency surface small (no framework-specific imports).

