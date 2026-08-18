# Agent Guidelines (`AGENTS.md`)

Backend project built with **Hono**, **TypeScript**, **Bun**, and **Drizzle ORM (PostgreSQL)**. Follow these core rules for all tasks.

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

## 3. Database & Drizzle ORM Rules
* **NO Relational Preload (`with:`) for multi-table queries:**
  * Never use Drizzle's relational query preloading (`db.query.<table_name>.findMany({ with: { ... } })`).
  * *Reason:* Drizzle translates `with:` into Postgres JSON aggregation (`json_build_array`). When parsed by the runtime, 64-bit `BigInt` / Snowflake IDs exceed JavaScript's `MAX_SAFE_INTEGER` and corrupt lower bits.
* **Use Query Builder with Joins:**
  * For queries joining multiple tables (e.g., sessions + users, invites + creators), always use the standard typed Query Builder:
    ```ts
    const [result] = await db
      .select({
        session: adminSessions,
        admin: admins,
      })
      .from(adminSessions)
      .innerJoin(admins, eq(adminSessions.adminId, admins.id))
    ```
* **Single-table queries:**
  * `db.query.<table>.findFirst()` and `findMany()` without the `with:` option are fully allowed and safe.

---

## 4. Testing
* **Test new code:** Write unit or integration tests (`bun test`) for every new endpoint, route, or business logic change.
* **Test via `app.request()`:** Test endpoints directly using `app.request()` rather than spinning up live network ports.
* **Verify before completion:** Ensure all existing and new tests pass before submitting changes.

---

## 5. Comments
* **Comment only when necessary:** Write comments exclusively for non-obvious workarounds, tricky edge cases, or complex domain rules.
* **Human and concise:** Keep comments brief, clear, and natural.
* **Avoid noise:** Do not add redundant comments that simply restate what the code does (e.g., avoid `// create new user`).
