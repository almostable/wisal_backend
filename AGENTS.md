# Agent Guidelines (`AGENTS.md`)

Follow these core rules for all tasks.

---

## 1. Scope & Execution
* **Stick to the plan:** Do not introduce unrequested features, custom abstractions, or refactors unless explicitly instructed.
* **Ask first:** If a required change is ambiguous or needs an architectural decision, clarify before implementing.
* **Use native tools:** Prefer built-in Hono utilities and Bun APIs over adding new third-party dependencies.

---

## 2. Architecture & Code Patterns
* **Input validation:** Always validate request payloads, query parameters, and headers using `@hono/zod-validator`. Extract typed data using `c.req.valid()`.
* **Error handling:** Throw `HTTPException` from `hono/http-exception` for operational/domain errors (e.g., 400, 401, 404). Avoid ad-hoc error JSON objects in nested logic; let the central `app.onError` handle formatting.
* **Keep it simple (KISS):** Write flat, readable, and predictable code. Avoid premature optimization, over-engineering, and unnecessary design patterns (e.g., avoid boilerplate abstractions where simple functions suffice).
* **Type safety:** Maintain strict TypeScript types. Avoid `any`.

---

## 3. Testing
* **Test new code:** Write unit or integration tests (`bun test`) for every new endpoint, route, or business logic change.
* **Test via `app.request()`:** Test endpoints directly using `app.request()` rather than spinning up live network ports.
* **Verify before completion:** Ensure all existing and new tests pass before submitting changes.

---

## 4. Comments
* **Comment only when necessary:** Write comments exclusively for non-obvious workarounds, tricky edge cases, or complex domain rules.
* **Human and concise:** Keep comments brief, clear, and natural.
* **Avoid noise:** Do not add redundant comments that simply restate what the code does (e.g., avoid `// create new user`).
