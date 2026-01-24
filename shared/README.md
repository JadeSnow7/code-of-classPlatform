# Shared Types & SDK

This package holds cross-platform API contracts and (future) shared SDK utilities.
It is intended to be imported by both web and mobile clients to keep interfaces consistent.

## Structure (draft)

- types/  - shared TypeScript interfaces aligned with OpenAPI
- sdk/    - shared API client helpers (planned)

## Usage (draft)

```ts
import { Course, ChatRequest } from '@/shared/types'
```

