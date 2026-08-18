# Admin API

### Авторизация
Header `Authorization: Bearer <token>` или Cookie `admin_session=<token>`.

---

## Аутентификация

### `POST /admin/login`
- **Доступ:** Публичный
- **Тело запроса (JSON):**
  - `email` *(string, обязательное)* — email администратора
  - `password` *(string, обязательное)* — пароль
- **Ответ `200 OK`:**
  - Устанавливает cookie `admin_session`
  ```json
  {
    "success": true,
    "admin": {
      "id": "111111111111111",
      "email": "admin@wisal.dev",
      "role": "admin",
      "createdAt": "2026-08-18T00:00:00.000Z",
      "updatedAt": "2026-08-18T00:00:00.000Z"
    },
    "token": "string"
  }
  ```

### `POST /admin/logout`
- **Доступ:** `admin`, `moderator`
- **Тело запроса:** Нет
- **Ответ `200 OK`:**
  - Удаляет cookie `admin_session`
  ```json
  {
    "success": true,
    "message": "Logged out successfully"
  }
  ```

### `GET /admin/me`
- **Доступ:** `admin`, `moderator`
- **Тело запроса:** Нет
- **Ответ `200 OK`:**
  ```json
  {
    "success": true,
    "admin": {
      "id": "111111111111111",
      "email": "admin@wisal.dev",
      "role": "admin",
      "createdAt": "2026-08-18T00:00:00.000Z",
      "updatedAt": "2026-08-18T00:00:00.000Z"
    }
  }
  ```

---

## Управление администраторами

### `GET /admin/admins`
- **Доступ:** `admin`
- **Query-параметры:**
  - `limit` *(number, опционально, по умолчанию: 50, макс: 100)*
  - `offset` *(number, опционально, по умолчанию: 0)*
- **Ответ `200 OK`:**
  ```json
  {
    "success": true,
    "admins": [
      {
        "id": "111111111111111",
        "email": "admin@wisal.dev",
        "role": "admin",
        "createdAt": "2026-08-18T00:00:00.000Z",
        "updatedAt": "2026-08-18T00:00:00.000Z"
      }
    ],
    "total": 1,
    "limit": 50,
    "offset": 0
  }
  ```

### `POST /admin/admins`
- **Доступ:** `admin`
- **Тело запроса (JSON):**
  - `email` *(string, обязательное)* — email нового администратора
  - `password` *(string, обязательное, мин. 16, макс. 128 симв.)* — пароль
  - `role` *(string, опционально, `"admin"` | `"moderator"`, по умолчанию: `"moderator"`)*
- **Ответ `201 Created`:**
  ```json
  {
    "success": true,
    "admin": {
      "id": "222222222222222",
      "email": "mod@wisal.dev",
      "role": "moderator",
      "createdAt": "2026-08-18T00:00:00.000Z",
      "updatedAt": "2026-08-18T00:00:00.000Z"
    }
  }
  ```

### `DELETE /admin/admins/:id`
- **Доступ:** `admin`
- **URL-параметры:**
  - `id` *(string, обязательное)* — Snowflake ID администратора
- **Ответ `200 OK`:**
  ```json
  {
    "success": true,
    "message": "Admin deleted successfully"
  }
  ```

---

## Инвайты

### `GET /admin/invites`
- **Доступ:** `admin`, `moderator`
- **Query-параметры:**
  - `status` *(string, опционально, `"all" | "active" | "used" | "expired"`, по умолчанию: `"all"`)* — фильтр по статусу инвайта
  - `q` / `search` *(string, опционально)* — поиск по коду инвайта, email создателя или email активировавшего пользователя
  - `limit` *(number, опционально, по умолчанию: 50, макс: 100)*
  - `offset` *(number, опционально, по умолчанию: 0)*
- **Ответ `200 OK`:**
  ```json
  {
    "success": true,
    "invites": [
      {
        "id": "333333333333333",
        "code": "WISAL-A1B2-C3D4",
        "expiresAt": "2026-08-19T00:00:00.000Z",
        "createdBy": {
          "id": "111111111111111",
          "email": "admin@wisal.dev",
          "role": "admin"
        },
        "usedBy": null,
        "usedAt": null,
        "createdAt": "2026-08-18T00:00:00.000Z",
        "updatedAt": "2026-08-18T00:00:00.000Z"
      }
    ],
    "total": 1,
    "stats": {
      "active": 7,
      "used": 2,
      "expired": 1
    },
    "limit": 50,
    "offset": 0
  }
  ```

### `POST /admin/invites`
- **Доступ:** `admin`, `moderator`
- **Тело запроса (JSON):**
  - `expiresAt` *(string/ISO date, обязательное)* — дата истечения срока
  - `code` *(string, опционально, мин. 8, макс. 64 симв.)* — кастомный код (если не указан, генерируется автоматически)
- **Ответ `201 Created`:**
  ```json
  {
    "success": true,
    "invite": {
      "id": "333333333333333",
      "code": "WISAL-A1B2-C3D4",
      "expiresAt": "2026-08-19T00:00:00.000Z",
      "createdBy": {
        "id": "111111111111111",
        "email": "admin@wisal.dev",
        "role": "admin"
      },
      "usedBy": null,
      "usedAt": null,
      "createdAt": "2026-08-18T00:00:00.000Z",
      "updatedAt": "2026-08-18T00:00:00.000Z"
    }
  }
  ```

### `DELETE /admin/invites/:id`
- **Доступ:** `admin`, `moderator`
- **URL-параметры:**
  - `id` *(string, обязательное)* — Snowflake ID инвайта
- **Ответ `200 OK`:**
  ```json
  {
    "success": true,
    "message": "Invite deleted successfully"
  }
  ```

---

## Пользователи

### `GET /admin/users`
- **Доступ:** `admin`, `moderator`
- **Query-параметры:**
  - `limit` *(number, опционально, по умолчанию: 50, макс: 100)*
  - `offset` *(number, опционально, по умолчанию: 0)*
- **Ответ `200 OK`:**
  ```json
  {
    "success": true,
    "users": [
      {
        "id": "100000000000000",
        "email": "user@wisal.dev",
        "createdAt": "2026-08-18T00:00:00.000Z",
        "updatedAt": "2026-08-18T00:00:00.000Z",
        "profile": {
          "id": "200000000000000",
          "accountId": "100000000000000",
          "name": "User Name",
          "identityId": "300000000000000",
          "createdAt": "2026-08-18T00:00:00.000Z",
          "updatedAt": "2026-08-18T00:00:00.000Z",
          "identity": null
        }
      }
    ],
    "total": 1,
    "limit": 50,
    "offset": 0
  }
  ```
