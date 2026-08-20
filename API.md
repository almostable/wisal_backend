# Wisal API Documentation

---

# User API

### Авторизация
Header `Authorization: Bearer <token>`.

---

## Аутентификация и аккаунты (`/auth`)

### `POST /auth/register`
- **Доступ:** Публичный
- **Тело запроса (JSON):**
  - `email` *(string, обязательное)* — email пользователя
  - `password` *(string, обязательное, мин. 12, макс. 128 симв.)* — пароль
  - `inviteCode` *(string, обязательное, мин. 8, макс. 64 симв.)* — код инвайта
- **Ответ `201 Created`:**
  ```json
  {
    "success": true,
    "account": {
      "id": "111111111111111",
      "email": "user@wisal.dev",
      "createdAt": "2026-08-20T00:00:00.000Z",
      "updatedAt": "2026-08-20T00:00:00.000Z"
    },
    "token": "string",
    "profile": null,
    "isOnboardingCompleted": false
  }
  ```

### `POST /auth/login`
- **Доступ:** Публичный
- **Тело запроса (JSON):**
  - `email` *(string, обязательное)* — email пользователя
  - `password` *(string, обязательное)* — пароль
- **Ответ `200 OK`:**
  ```json
  {
    "success": true,
    "account": {
      "id": "111111111111111",
      "email": "user@wisal.dev",
      "createdAt": "2026-08-20T00:00:00.000Z",
      "updatedAt": "2026-08-20T00:00:00.000Z"
    },
    "token": "string",
    "profile": {
      "id": "222222222222222",
      "name": "John Doe",
      "isMale": true,
      "avatarKey": null,
      "description": "Bio text",
      "contacts": {
        "telegram": "https://t.me/johndoe",
        "youtube": null,
        "instagram": null,
        "website": null,
        "email": null
      },
      "createdAt": "2026-08-20T00:00:00.000Z",
      "updatedAt": "2026-08-20T00:00:00.000Z",
      "identity": "johndoe"
    },
    "isOnboardingCompleted": true
  }
  ```

### `POST /auth/logout`
- **Доступ:** Авторизованный пользователь
- **Тело запроса:** Нет
- **Ответ `200 OK`:**
  ```json
  {
    "success": true,
    "message": "Logged out successfully"
  }
  ```

### `POST /auth/logout-all`
- **Доступ:** Авторизованный пользователь
- **Тело запроса:** Нет
- **Ответ `200 OK`:**
  ```json
  {
    "success": true,
    "message": "All sessions logged out successfully"
  }
  ```

### `GET /auth/me`
- **Доступ:** Авторизованный пользователь
- **Тело запроса:** Нет
- **Ответ `200 OK`:**
  ```json
  {
    "success": true,
    "account": {
      "id": "111111111111111",
      "email": "user@wisal.dev",
      "createdAt": "2026-08-20T00:00:00.000Z",
      "updatedAt": "2026-08-20T00:00:00.000Z"
    },
    "profile": {
      "id": "222222222222222",
      "name": "John Doe",
      "isMale": true,
      "avatarKey": null,
      "description": "Bio text",
      "contacts": null,
      "createdAt": "2026-08-20T00:00:00.000Z",
      "updatedAt": "2026-08-20T00:00:00.000Z",
      "identity": "johndoe"
    },
    "isOnboardingCompleted": true
  }
  ```

---

## Управление профилем (`/profile`)

### `GET /profile/me`
- **Доступ:** Авторизованный пользователь
- **Тело запроса:** Нет
- **Ответ `200 OK`:**
  ```json
  {
    "success": true,
    "profile": {
      "id": "222222222222222",
      "name": "John Doe",
      "isMale": true,
      "avatarKey": null,
      "description": "Bio text",
      "contacts": null,
      "createdAt": "2026-08-20T00:00:00.000Z",
      "updatedAt": "2026-08-20T00:00:00.000Z",
      "identity": "johndoe"
    },
    "isOnboardingCompleted": true
  }
  ```

### `POST /profile/onboarding`
- **Доступ:** Авторизованный пользователь
- **Тело запроса (JSON):**
  - `name` *(string, обязательное, мин. 1, макс. 100 симв.)* — отображаемое имя
  - `isMale` *(boolean, обязательное)* — пол (после онбординга неизменяем)
  - `identity` *(string, обязательное, мин. 3, макс. 32 симв., `^[a-z0-9_]+$`)* — уникальный юзернейм/хэндл
  - `avatarKey` *(string, опционально)* — ключ аватара в хранилище
  - `description` *(string, опционально, макс. 500 симв.)* — описание/биография
  - `contacts` *(object, опционально)* — контакты (`telegram`, `youtube`, `instagram`, `website`, `email`)
- **Ответ `200 OK`:**
  ```json
  {
    "success": true,
    "profile": {
      "id": "222222222222222",
      "name": "John Doe",
      "isMale": true,
      "avatarKey": null,
      "description": "Bio text",
      "contacts": null,
      "createdAt": "2026-08-20T00:00:00.000Z",
      "updatedAt": "2026-08-20T00:00:00.000Z",
      "identity": "johndoe"
    }
  }
  ```

### `PATCH /profile/me`
- **Доступ:** Авторизованный пользователь
- **Тело запроса (JSON):**
  - `name` *(string, опционально, мин. 1, макс. 100 симв.)*
  - `identity` *(string, опционально, мин. 3, макс. 32 симв., `^[a-z0-9_]+$`)* — новый уникальный юзернейм/хэндл
  - `avatarKey` *(string | null, опционально)*
  - `description` *(string | null, опционально, макс. 500 симв.)*
  - `contacts` *(object | null, опционально)*
  - `isMale` *(boolean, опционально, допустимо только если пол ранее не был задан)*
- **Ответ `200 OK`:**
  ```json
  {
    "success": true,
    "profile": {
      "id": "222222222222222",
      "name": "Updated Name",
      "isMale": true,
      "avatarKey": "avatars/user.png",
      "description": "New bio",
      "contacts": {
        "telegram": "https://t.me/updated",
        "youtube": null,
        "instagram": null,
        "website": null,
        "email": null
      },
      "createdAt": "2026-08-20T00:00:00.000Z",
      "updatedAt": "2026-08-20T00:00:00.000Z",
      "identity": "johndoe"
    }
  }
  ```

### `GET /profile/invites`
- **Доступ:** Авторизованный пользователь
- **Query-параметры:**
  - `status` *(string, опционально, `"all" | "active" | "used" | "expired"`, по умолчанию: `"all"`)* — фильтр по статусу
  - `limit` *(number, опционально, по умолчанию: 50, макс: 100)*
  - `offset` *(number, опционально, по умолчанию: 0)*
- **Ответ `200 OK`:**
  ```json
  {
    "success": true,
    "invites": [
      {
        "id": "444444444444444",
        "code": "WISAL-A1B2-C3D4-E5F6",
        "expiresAt": "2026-09-19T00:00:00.000Z",
        "usedBy": {
          "id": "555555555555555",
          "email": "friend@wisal.dev",
          "name": "Friend Name",
          "avatarKey": null,
          "identity": "friendhandle"
        },
        "usedAt": "2026-08-21T00:00:00.000Z",
        "createdAt": "2026-08-20T00:00:00.000Z",
        "updatedAt": "2026-08-21T00:00:00.000Z"
      }
    ],
    "total": 5,
    "stats": {
      "active": 4,
      "used": 1,
      "expired": 0
    },
    "limit": 50,
    "offset": 0
  }
  ```

### `GET /profile/followers`
- **Доступ:** Авторизованный пользователь
- **Query-параметры:**
  - `limit` *(number, опционально, по умолчанию: 50, макс: 100)*
  - `offset` *(number, опционально, по умолчанию: 0)*
- **Ответ `200 OK`:**
  ```json
  {
    "success": true,
    "users": [
      {
        "id": "111111111111111",
        "name": "Follower Name",
        "avatarKey": null,
        "description": "User bio",
        "identity": "follower_handle",
        "followedAt": "2026-08-20T00:00:00.000Z"
      }
    ],
    "total": 1,
    "limit": 50,
    "offset": 0
  }
  ```

### `GET /profile/following`
- **Доступ:** Авторизованный пользователь
- **Query-параметры:**
  - `limit` *(number, опционально, по умолчанию: 50, макс: 100)*
  - `offset` *(number, опционально, по умолчанию: 0)*
- **Ответ `200 OK`:**
  ```json
  {
    "success": true,
    "users": [
      {
        "id": "222222222222222",
        "name": "Following Name",
        "avatarKey": "avatars/user.png",
        "description": "User bio",
        "identity": "following_handle",
        "followedAt": "2026-08-20T00:00:00.000Z"
      }
    ],
    "total": 1,
    "limit": 50,
    "offset": 0
  }
  ```

### `GET /profile/:identity/followers`
- **Доступ:** Публичный / Опциональная авторизация
- **URL-параметры:**
  - `identity` *(string, обязательное)* — юзернейм/хэндл пользователя
- **Query-параметры:**
  - `limit` *(number, опционально, по умолчанию: 50, макс: 100)*
  - `offset` *(number, опционально, по умолчанию: 0)*
- **Ответ `200 OK`:**
  ```json
  {
    "success": true,
    "users": [
      {
        "id": "111111111111111",
        "name": "Follower Name",
        "avatarKey": null,
        "description": "User bio",
        "identity": "follower_handle",
        "followedAt": "2026-08-20T00:00:00.000Z"
      }
    ],
    "total": 1,
    "limit": 50,
    "offset": 0
  }
  ```

### `GET /profile/:identity/following`
- **Доступ:** Публичный / Опциональная авторизация
- **URL-параметры:**
  - `identity` *(string, обязательное)* — юзернейм/хэндл пользователя
- **Query-параметры:**
  - `limit` *(number, опционально, по умолчанию: 50, макс: 100)*
  - `offset` *(number, опционально, по умолчанию: 0)*
- **Ответ `200 OK`:**
  ```json
  {
    "success": true,
    "users": [
      {
        "id": "222222222222222",
        "name": "Following Name",
        "avatarKey": "avatars/user.png",
        "description": "User bio",
        "identity": "following_handle",
        "followedAt": "2026-08-20T00:00:00.000Z"
      }
    ],
    "total": 1,
    "limit": 50,
    "offset": 0
  }
  ```

### `POST /profile/:identity/follow`
- **Доступ:** Авторизованный пользователь
- **URL-параметры:**
  - `identity` *(string, обязательное)* — юзернейм/хэндл пользователя, на которого нужно подписаться
- **Ответ `200 OK`:**
  ```json
  {
    "success": true,
    "following": true,
    "message": "Successfully followed user"
  }
  ```

### `DELETE /profile/:identity/follow`
- **Доступ:** Авторизованный пользователь
- **URL-параметры:**
  - `identity` *(string, обязательное)* — юзернейм/хэндл пользователя, от которого нужно отписаться
- **Ответ `200 OK`:**
  ```json
  {
    "success": true,
    "following": false,
    "message": "Successfully unfollowed user"
  }
  ```

### `GET /profile/check/:identity`
- **Доступ:** Публичный
- **URL-параметры:**
  - `identity` *(string, обязательное)* — проверяемый юзернейм/хэндл
- **Ответ `200 OK`:**
  ```json
  {
    "success": true,
    "available": true,
    "identity": "johndoe"
  }
  ```

### `GET /profile/:identity`
- **Доступ:** Публичный
- **URL-параметры:**
  - `identity` *(string, обязательное)* — юзернейм/хэндл пользователя
- **Ответ `200 OK`:**
  ```json
  {
    "success": true,
    "profile": {
      "id": "222222222222222",
      "name": "John Doe",
      "isMale": true,
      "avatarKey": null,
      "description": "Bio text",
      "contacts": {
        "telegram": "https://t.me/johndoe",
        "youtube": null,
        "instagram": null,
        "website": null,
        "email": null
      },
      "createdAt": "2026-08-20T00:00:00.000Z",
      "identity": "johndoe"
    }
  }
  ```

---

# Admin API

### Авторизация
Header `Authorization: Bearer <token>` или Cookie `admin_session=<token>`.

---

## Аутентификация администратора

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
        "inviter": null,
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
      "inviter": null,
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
          "name": "User Name",
          "isMale": true,
          "avatarKey": null,
          "description": null,
          "contacts": null,
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
