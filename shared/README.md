# Shared Types, SDK & Core

This package holds cross-platform API contracts, a shared SDK, and core utilities.
It is intended to be imported by both web and mobile clients to keep interfaces consistent.

## Structure

- src/types/  - shared TypeScript interfaces aligned with OpenAPI
- src/sdk/    - shared API client and endpoint wrappers
- src/core/   - platform-agnostic utilities (storage, etc.)

## Usage

```ts
import { createApi, Course, ChatRequest } from '@classplatform/shared'
```
