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
- **Доступ:** Авторизованный пользователь
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
- **Доступ:** Авторизованный пользователь
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

### `GET /profile/blocks`
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
        "name": "Blocked User",
        "avatarKey": null,
        "identity": "blocked_handle",
        "isMale": false,
        "blockedAt": "2026-08-20T00:00:00.000Z"
      }
    ],
    "total": 1,
    "limit": 50,
    "offset": 0
  }
  ```

### `POST /profile/:identity/block`
- **Доступ:** Авторизованный пользователь
- **URL-параметры:**
  - `identity` *(string, обязательное)* — юзернейм/хэндл пользователя для блокировки
- **Поведение:** Взаимные подписки в `follows` мгновенно удаляются в обоих направлениях в одной транзакции.
- **Ответ `200 OK`:**
  ```json
  {
    "success": true,
    "blocked": true,
    "message": "Successfully blocked user"
  }
  ```

### `DELETE /profile/:identity/block`
- **Доступ:** Авторизованный пользователь
- **URL-параметры:**
  - `identity` *(string, обязательное)* — юзернейм/хэндл пользователя для разблокировки
- **Ответ `200 OK`:**
  ```json
  {
    "success": true,
    "blocked": false,
    "message": "Successfully unblocked user"
  }
  ```

### `GET /profile/check/:identity`
- **Доступ:** Авторизованный пользователь
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
- **Доступ:** Авторизованный пользователь
- **URL-параметры:**
  - `identity` *(string, обязательное)* — юзернейм/хэндл пользователя
- **Поведение при блокировке:**
  - Если авторизованный пользователь заблокировал автора (`is_blocked: true`) или заблокирован автором (`is_hidden: true`): возвращаются только `id`, `name`, `identity`, `isMale` (аватарка, описание, контакты отсутствуют).
- **Ответ `200 OK` (обычный):**
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
      "identity": "johndoe",
      "isFollowing": true
    }
  }
  ```
- **Ответ `200 OK` (при блокировке):**
  ```json
  {
    "success": true,
    "profile": {
      "id": "222222222222222",
      "name": "John Doe",
      "isMale": true,
      "avatarKey": null,
      "description": null,
      "contacts": null,
      "createdAt": "2026-08-20T00:00:00.000Z",
      "identity": "johndoe",
      "isFollowing": false,
      "is_blocked": true,
      "isBlocked": true
    }
  }
  ```

---

## Загрузка медиафайлов (`/uploads`)

Двухшаговая загрузка медиафайлов (изображений) в Cloudflare R2 по Presigned URL с хранением `fileKey` в PostgreSQL.

### Архитектурный Flow
1. iOS запрашивает ссылку: `POST /uploads/presign { "ext": "jpg", "contentType": "image/jpeg" }`.
2. API валидирует расширение/MIME и возвращает `200 OK` с `uploadUrl` (TTL 10 минут) и `fileKey` (`media/YYYY-MM-DD/<snowflake>.jpg`).
3. iOS загружает бинарный файл напрямую в Cloudflare R2 через HTTP `PUT <uploadUrl>` с заголовком `Content-Type: image/jpeg`.
4. iOS использует `fileKey` в бизнес-логике:
   - Обновление аватара профиля: `PATCH /profile/me { "avatarKey": "media/..." }`
   - Создание публикации с фото: `POST /posts { "type": "media", "payload": { "media": [{ "fileKey": "media/...", "width": 1920, "height": 1080 }] }, "content": "..." }`
   - Добавление комментария с фото: `POST /posts/:id/comments { "type": "media", "payload": { "media": [{ "fileKey": "media/...", "width": 800, "height": 600 }] }, "content": "..." }`

### `POST /uploads/presign`
- **Доступ:** Авторизованный пользователь (`Authorization: Bearer <token>`)
- **Тело запроса (JSON):**
  - `ext` *(string, обязательное, `"jpg" | "jpeg" | "png" | "webp"`)* — расширение файла
  - `contentType` *(string, обязательное)* — MIME-тип (`image/jpeg`, `image/png`, `image/webp`)
- **Ответ `200 OK`:**
  ```json
  {
    "success": true,
    "uploadUrl": "https://<account_id>.r2.cloudflarestorage.com/wisal-media/media/2026-08-30/723491823749128301.jpg?X-Amz-Algorithm=...",
    "fileKey": "media/2026-08-30/723491823749128301.jpg",
    "expiresIn": 600
  }
  ```
- **Ошибки:**
  - `400 Bad Request` — неподдерживаемое расширение или несовпадающий MIME-тип.
  - `401 Unauthorized` — отсутствие токена авторизации.

---

## Публикации и лента (`/posts`)

> **Важно:** Все эндпоинты `/posts` требуют авторизации (`Authorization: Bearer <token>`) и полностью пройденного онбординга (заданный пол `isMale` и уникальный `identity`).

### `POST /posts`
- **Доступ:** Авторизованный пользователь с онбордингом
- **Тело запроса (JSON):**
  - `type` *(string, опционально, `"text" | "media"`, по умолчанию: `"text"`)* — тип поста
  - `content` *(string, обязательное для `type: "text"`, опционально для `type: "media"`, макс. 5000 симв.)* — текст поста
  - `payload` *(object, обязательное для `type: "media"`, по умолчанию: `{}`)*:
    - Для `type: "media"`: `{ "media": [{ "fileKey": string, "width": number, "height": number }] }` (от 1 до 10 файлов)
    - Для `type: "text"`: `{}`
  - `genderScope` *(string, опционально, `"all" | "same_gender"`, по умолчанию: `"all"`)* — охват по полу (`same_gender` — только для своего пола)
  - `accessLevel` *(string, опционально, `"public" | "followers"`, по умолчанию: `"public"`)* — уровень видимости
  - `isPinned` *(boolean, опционально, по умолчанию: `false`)* — закрепить пост (снимает закреп с других постов пользователя)
- **Ответ `201 Created`:**
  ```json
  {
    "success": true,
    "post": {
      "id": "999999999999991",
      "authorId": "111111111111111",
      "authorGender": true,
      "type": "media",
      "payload": {
        "media": [
          {
            "fileKey": "media/2026-08-30/723491823749128301.jpg",
            "width": 1920,
            "height": 1080
          }
        ]
      },
      "content": "Hello Wisal world!",
      "genderScope": "all",
      "accessLevel": "public",
      "isPinned": false,
      "likesCount": 0,
      "commentsCount": 0,
      "isLiked": false,
      "createdAt": "2026-08-20T00:00:00.000Z",
      "updatedAt": "2026-08-20T00:00:00.000Z",
      "author": {
        "id": "111111111111111",
        "name": "John Doe",
        "identity": "johndoe",
        "avatarKey": null,
        "isMale": true
      }
    }
  ```

### `PATCH /posts/:id`
- **Доступ:** Автор поста (с онбордингом)
- **Ограничение по времени:** Редактирование публикации разрешено только в течение **15 минут** с момента создания (`createdAt`). По истечении 15 минут возвращается ошибка `403 Forbidden`.
- **URL-параметры:**
  - `id` *(string, обязательное)* — Snowflake ID поста
- **Тело запроса (JSON):**
  - `content` *(string, опционально, мин. 1, макс. 5000 симв.)*
  - `genderScope` *(string, опционально, `"all" | "same_gender"`)*
  - `accessLevel` *(string, опционально, `"public" | "followers"`)*
  - `isPinned` *(boolean, опционально)*
  - `payload` *(object, опционально)*
- **Ответ `200 OK`:**
  ```json
  {
    "success": true,
    "post": {
      "id": "999999999999991",
      "authorId": "111111111111111",
      "authorGender": true,
      "type": "text",
      "payload": {},
      "content": "Updated post content",
      "genderScope": "same_gender",
      "accessLevel": "public",
      "isPinned": false,
      "likesCount": 0,
      "commentsCount": 0,
      "isLiked": false,
      "createdAt": "2026-08-20T00:00:00.000Z",
      "updatedAt": "2026-08-20T00:00:00.000Z",
      "author": {
        "id": "111111111111111",
        "name": "John Doe",
        "identity": "johndoe",
        "avatarKey": null,
        "isMale": true
      }
    }
  }
  ```

### `DELETE /posts/:id`
- **Доступ:** Автор поста (с онбордингом)
- **URL-параметры:**
  - `id` *(string, обязательное)* — Snowflake ID поста
- **Ответ `200 OK`:**
  ```json
  {
    "success": true,
    "message": "Post deleted successfully"
  }
  ```

### `PATCH /posts/:id/pin`
- **Доступ:** Автор поста (с онбордингом)
- **URL-параметры:**
  - `id` *(string, обязательное)* — Snowflake ID поста
- **Тело запроса (JSON):**
  - `isPinned` *(boolean, опционально, по умолчанию: `true`)* — закрепить (`true`) или открепить (`false`)
- **Ответ `200 OK`:**
  ```json
  {
    "success": true,
    "post": {
      "id": "999999999999991",
      "authorId": "111111111111111",
      "authorGender": true,
      "type": "text",
      "payload": {},
      "content": "Pinned post content",
      "genderScope": "all",
      "accessLevel": "public",
      "isPinned": true,
      "likesCount": 0,
      "commentsCount": 0,
      "isLiked": false,
      "createdAt": "2026-08-20T00:00:00.000Z",
      "updatedAt": "2026-08-20T00:00:00.000Z",
      "author": {
        "id": "111111111111111",
        "name": "John Doe",
        "identity": "johndoe",
        "avatarKey": null,
        "isMale": true
      }
    }
  }
  ```

### `POST /posts/:id/like`
- **Доступ:** Авторизованный пользователь с онбордингом (с учетом прав `gender_scope` и `access_level`)
- **URL-параметры:**
  - `id` *(string, обязательное)* — Snowflake ID поста
- **Ответ `200 OK`:**
  ```json
  {
    "success": true,
    "liked": true,
    "likesCount": 1,
    "message": "Post liked successfully"
  }
  ```

### `POST /posts/:id/unlike`
- **Доступ:** Авторизованный пользователь с онбордингом (с учетом прав `gender_scope` и `access_level`)
- **URL-параметры:**
  - `id` *(string, обязательное)* — Snowflake ID поста
- **Ответ `200 OK`:**
  ```json
  {
    "success": true,
    "liked": false,
    "likesCount": 0,
    "message": "Post unliked successfully"
  }
  ```

### `GET /posts/feed`
- **Доступ:** Авторизованный пользователь с онбордингом
- **Query-параметры:**
  - `feed` *(string, опционально, `"public" | "following"`, по умолчанию: `"public"`)* — вид ленты (`public` — рандомная выборка, `following` — подписки в хронологическом порядке)
  - `limit` *(number, опционально, по умолчанию: 20, макс: 100)*
  - `offset` *(number, опционально, по умолчанию: 0)*
- **Ответ `200 OK`:**
  ```json
  {
    "success": true,
    "posts": [
      {
        "id": "999999999999991",
        "authorId": "111111111111111",
        "authorGender": true,
        "type": "text",
        "payload": {},
        "content": "Feed post",
        "genderScope": "all",
        "accessLevel": "public",
        "isPinned": false,
        "likesCount": 5,
        "commentsCount": 2,
        "isLiked": true,
        "createdAt": "2026-08-20T00:00:00.000Z",
        "updatedAt": "2026-08-20T00:00:00.000Z",
        "author": {
          "id": "111111111111111",
          "name": "John Doe",
          "identity": "johndoe",
          "avatarKey": null,
          "isMale": true,
          "isFollowing": true
        }
      }
    ],
    "limit": 20,
    "offset": 0
  }
  ```

### `GET /posts/:id`
- **Доступ:** Авторизованный пользователь с онбордингом (с учетом прав `gender_scope` и `access_level`)
- **URL-параметры:**
  - `id` *(string, обязательное)* — Snowflake ID поста
- **Ответ `200 OK`:**
  ```json
  {
    "success": true,
    "post": {
      "id": "999999999999991",
      "authorId": "111111111111111",
      "authorGender": true,
      "type": "text",
      "payload": {},
      "content": "Specific post content",
      "genderScope": "all",
      "accessLevel": "public",
      "isPinned": false,
      "likesCount": 10,
      "commentsCount": 4,
      "isLiked": true,
      "createdAt": "2026-08-20T00:00:00.000Z",
      "updatedAt": "2026-08-20T00:00:00.000Z",
      "author": {
        "id": "111111111111111",
        "name": "John Doe",
        "identity": "johndoe",
        "avatarKey": null,
        "isMale": true,
        "isFollowing": true
      }
    }
  }
  ```

### `GET /posts/user/:identity`
- **Доступ:** Авторизованный пользователь с онбордингом (с учетом прав `gender_scope` и `access_level`)
- **URL-параметры:**
  - `identity` *(string, обязательное)* — юзернейм/хэндл автора
- **Query-параметры:**
  - `limit` *(number, опционально, по умолчанию: 20, макс: 100)*
  - `offset` *(number, опционально, по умолчанию: 0)*
- **Ответ `200 OK`:**
  ```json
  {
    "success": true,
    "posts": [
      {
        "id": "999999999999991",
        "authorId": "111111111111111",
        "authorGender": true,
        "type": "text",
        "payload": {},
        "content": "Pinned user post",
        "genderScope": "all",
        "accessLevel": "public",
        "isPinned": true,
        "likesCount": 3,
        "commentsCount": 1,
        "isLiked": false,
        "createdAt": "2026-08-20T00:00:00.000Z",
        "updatedAt": "2026-08-20T00:00:00.000Z",
        "author": {
          "id": "111111111111111",
          "name": "John Doe",
          "identity": "johndoe",
          "avatarKey": null,
          "isMale": true,
          "isFollowing": true
        }
      }
    ],
    "total": 1,
    "limit": 20,
    "offset": 0
  }
  ```

---

## Комментарии к публикациям (`/posts`)

> **Модель веток комментариев (2-level flat hierarchy):**
> - **1-й уровень:** Корневые комментарии непосредственно к посту (`parentId = null`, `replyToUser = null`).
> - **2-й уровень (реплаи):** Все ответы внутри ветки привязаны к корневому комментарию (`parentId = <rootCommentId>`).
> - Если пользователь отвечает на конкретный реплай внутри ветки, поле `parentId` автоматически указывает на корневой комментарий ветки, а `replyToCommentId` и `replyToUser` (`{ id, name, identity }`) содержат данные того комментария и автора, которому адресован ответ (для отображения в UI плашки `Reply to @username`).
> - Поле `repliesCount` у корневого комментария отражает **общее число всех ответов в этой ветке**.
> - Поле `commentsCount` у поста отражает **общее число всех комментариев и ответов под постом**.

### `GET /posts/:id/comments`
- **Доступ:** Авторизованный пользователь с онбордингом (с учетом прав доступа к посту)
- **Описание:** Возвращает только комментарии первого уровня (ответы непосредственно на сам пост). Реплаи на комментарии запрашиваются отдельно через `GET /posts/comments/:id/replies`.
- **URL-параметры:**
  - `id` *(string, обязательное)* — Snowflake ID поста
- **Query-параметры:**
  - `limit` *(number, опционально, по умолчанию: 50, макс: 100)*
  - `offset` *(number, опционально, по умолчанию: 0)*
- **Ответ `200 OK`:**
  ```json
  {
    "success": true,
    "comments": [
      {
        "id": "888888888888881",
        "postId": "999999999999991",
        "authorId": "111111111111111",
        "parentId": null,
        "replyToCommentId": null,
        "replyToUser": null,
        "type": "text",
        "payload": {},
        "content": "First comment on post",
        "repliesCount": 2,
        "createdAt": "2026-08-20T00:00:00.000Z",
        "updatedAt": "2026-08-20T00:00:00.000Z",
        "author": {
          "id": "111111111111111",
          "name": "John Doe",
          "identity": "johndoe",
          "avatarKey": null,
          "isMale": true
        }
      }
    ],
    "total": 1,
    "limit": 50,
    "offset": 0
  }
  ```

### `GET /posts/comments/:id/replies`
- **Доступ:** Авторизованный пользователь с онбордингом (с учетом прав доступа к посту комментария)
- **Описание:** Возвращает плоский хронологический список всех ответов (реплаев) ветки указанного комментария (`createdAt ASC`). Принимает ID как корневого комментария, так и любого реплая ветки.
- **URL-параметры:**
  - `id` *(string, обязательное)* — Snowflake ID комментария
- **Query-параметры:**
  - `limit` *(number, опционально, по умолчанию: 50, макс: 100)*
  - `offset` *(number, опционально, по умолчанию: 0)*
- **Ответ `200 OK`:**
  ```json
  {
    "success": true,
    "comments": [
      {
        "id": "888888888888882",
        "postId": "999999999999991",
        "authorId": "222222222222222",
        "parentId": "888888888888881",
        "replyToCommentId": "888888888888881",
        "replyToUser": {
          "id": "111111111111111",
          "name": "John Doe",
          "identity": "johndoe"
        },
        "type": "text",
        "payload": {},
        "content": "Reply to first comment",
        "repliesCount": 0,
        "createdAt": "2026-08-20T00:01:00.000Z",
        "updatedAt": "2026-08-20T00:01:00.000Z",
        "author": {
          "id": "222222222222222",
          "name": "Jane Smith",
          "identity": "janesmith",
          "avatarKey": null,
          "isMale": false
        }
      },
      {
        "id": "888888888888883",
        "postId": "999999999999991",
        "authorId": "333333333333333",
        "parentId": "888888888888881",
        "replyToCommentId": "888888888888882",
        "replyToUser": {
          "id": "222222222222222",
          "name": "Jane Smith",
          "identity": "janesmith"
        },
        "type": "text",
        "payload": {},
        "content": "Reply to Jane inside same thread",
        "repliesCount": 0,
        "createdAt": "2026-08-20T00:02:00.000Z",
        "updatedAt": "2026-08-20T00:02:00.000Z",
        "author": {
          "id": "333333333333333",
          "name": "Alex Brown",
          "identity": "alexbrown",
          "avatarKey": null,
          "isMale": true
        }
      }
    ],
    "total": 2,
    "limit": 50,
    "offset": 0
  }
  ```

### `POST /posts/:id/comments`
- **Доступ:** Авторизованный пользователь с онбордингом (с учетом прав доступа к посту)
- **URL-параметры:**
  - `id` *(string, обязательное)* — Snowflake ID поста
- **Тело запроса (JSON):**
  - `type` *(string, опционально, `"text" | "media"`, по умолчанию: `"text"`)*
  - `content` *(string, обязательное для `type: "text"`, опционально для `type: "media"`, макс. 5000 симв.)* — текст комментария
  - `payload` *(object, обязательное для `type: "media"`, по умолчанию: `{}`)*:
    - Для `type: "media"`: `{ "media": [{ "fileKey": string, "width": number, "height": number }] }` (от 1 до 10 файлов)
    - Для `type: "text"`: `{}`
  - `parentId` *(string | null, опционально)* — Snowflake ID родительского комментария (если ответ)
- **Ответ `201 Created`:**
  ```json
  {
    "success": true,
    "comment": {
      "id": "888888888888881",
      "postId": "999999999999991",
      "authorId": "111111111111111",
      "parentId": null,
      "replyToCommentId": null,
      "replyToUser": null,
      "type": "text",
      "payload": {},
      "content": "First comment on post",
      "repliesCount": 0,
      "createdAt": "2026-08-20T00:00:00.000Z",
      "updatedAt": "2026-08-20T00:00:00.000Z",
      "author": {
        "id": "111111111111111",
        "name": "John Doe",
        "identity": "johndoe",
        "avatarKey": null,
        "isMale": true
      }
    }
  }
  ```

### `POST /posts/comments/:id/reply`
- **Доступ:** Авторизованный пользователь с онбордингом (с учетом прав доступа к посту)
- **URL-параметры:**
  - `id` *(string, обязательное)* — Snowflake ID родительского комментария (корневого или реплая)
- **Тело запроса (JSON):**
  - `type` *(string, опционально, `"text" | "media"`, по умолчанию: `"text"`)*
  - `content` *(string, обязательное для `type: "text"`, опционально для `type: "media"`, макс. 5000 симв.)* — текст ответа
  - `payload` *(object, обязательное для `type: "media"`, по умолчанию: `{}`)*
- **Ответ `201 Created`:**
  ```json
  {
    "success": true,
    "comment": {
      "id": "888888888888882",
      "postId": "999999999999991",
      "authorId": "222222222222222",
      "parentId": "888888888888881",
      "replyToCommentId": "888888888888881",
      "replyToUser": {
        "id": "111111111111111",
        "name": "John Doe",
        "identity": "johndoe"
      },
      "type": "text",
      "payload": {},
      "content": "Reply to first comment",
      "repliesCount": 0,
      "createdAt": "2026-08-20T00:01:00.000Z",
      "updatedAt": "2026-08-20T00:01:00.000Z",
      "author": {
        "id": "222222222222222",
        "name": "Jane Smith",
        "identity": "janesmith",
        "avatarKey": null,
        "isMale": false
      }
    }
  }
  ```

### `PATCH /posts/comments/:id`
- **Доступ:** Автор комментария (с онбордингом)
- **Ограничение по времени:** Редактирование комментария разрешено только в течение **15 минут** с момента создания (`createdAt`). По истечении 15 минут возвращается ошибка `403 Forbidden`.
- **URL-параметры:**
  - `id` *(string, обязательное)* — Snowflake ID комментария
- **Тело запроса (JSON):**
  - `content` *(string, опционально, мин. 1, макс. 5000 симв.)* — обновленный текст комментария
  - `payload` *(object, опционально)*
- **Ответ `200 OK`:**
  ```json
  {
    "success": true,
    "comment": {
      "id": "888888888888881",
      "postId": "999999999999991",
      "authorId": "111111111111111",
      "parentId": null,
      "replyToCommentId": null,
      "replyToUser": null,
      "type": "text",
      "payload": {},
      "content": "Edited comment text",
      "repliesCount": 2,
      "createdAt": "2026-08-20T00:00:00.000Z",
      "updatedAt": "2026-08-20T00:05:00.000Z",
      "author": {
        "id": "111111111111111",
        "name": "John Doe",
        "identity": "johndoe",
        "avatarKey": null,
        "isMale": true
      }
    }
  }
  ```

### `DELETE /posts/comments/:id`
- **Доступ:** Автор комментария (с онбордингом)
- **URL-параметры:**
  - `id` *(string, обязательное)* — Snowflake ID комментария
- **Ответ `200 OK`:**
  ```json
  {
    "success": true,
    "message": "Comment deleted successfully"
  }
  ```

---

## Жалобы пользователей (`/reports`)

### `POST /reports`
- **Доступ:** Авторизованный пользователь с онбордингом
- **Поведение и ограничения:**
  - Пользователь может подать несколько жалоб на один и тот же целевой объект (`targetType`, `targetId`), но только с **разными** причинами (`reason`).
  - При попытке отправить повторную жалобу на тот же объект с уже использованной ранее причиной возвращается ошибка `409 Conflict`.
  - Запрещено жаловаться на самого себя или на собственный контент (`400 Bad Request`).
- **Тело запроса (JSON):**
  - `targetType` *(string, обязательное, `"post" | "comment" | "user"`)* — тип объекта жалобы
  - `targetId` *(string, обязательное)* — Snowflake ID объекта жалобы
  - `reason` *(string, обязательное, `"boundary_violation" | "inappropriate_content" | "toxicity" | "fraud_or_scam" | "spam" | "gender_mismatch" | "other"`)* — причина жалобы
  - `details` *(string, опционально, макс. 1000 симв.)* — комментарий пожаловавшегося
- **Ответ `201 Created`:**
  ```json
  {
    "success": true,
    "report": {
      "id": "999999999999991",
      "reporterId": "111111111111111",
      "reportedUserId": "222222222222222",
      "targetType": "post",
      "targetId": "888888888888881",
      "reason": "spam",
      "details": "Spam details",
      "status": "pending",
      "resolveById": null,
      "modNote": null,
      "resolvedAt": null,
      "createdAt": "2026-08-21T00:00:00.000Z",
      "updatedAt": "2026-08-21T00:00:00.000Z"
    }
  }
  ```

### `GET /reports`
- **Доступ:** Авторизованный пользователь с онбордингом
- **Query-параметры:**
  - `status` *(string, опционально, `"all" | "pending" | "resolved" | "rejected"`, по умолчанию: `"all"`)*
  - `limit` *(number, опционально, по умолчанию: 50, макс: 100)*
  - `offset` *(number, опционально, по умолчанию: 0)*
- **Ответ `200 OK`:**
  ```json
  {
    "success": true,
    "reports": [
      {
        "id": "999999999999991",
        "reporterId": "111111111111111",
        "reportedUserId": "222222222222222",
        "targetType": "post",
        "targetId": "888888888888881",
        "reason": "spam",
        "details": "Spam details",
        "status": "pending",
        "resolveById": null,
        "modNote": null,
        "resolvedAt": null,
        "createdAt": "2026-08-21T00:00:00.000Z",
        "updatedAt": "2026-08-21T00:00:00.000Z"
      }
    ],
    "total": 1,
    "limit": 50,
    "offset": 0
  }
  ```

### `GET /reports/:id`
- **Доступ:** Авторизованный пользователь с онбордингом (автор жалобы)
- **URL-параметры:**
  - `id` *(string, обязательное)* — Snowflake ID жалобы
- **Ответ `200 OK`:**
  ```json
  {
    "success": true,
    "report": {
      "id": "999999999999991",
      "reporterId": "111111111111111",
      "reportedUserId": "222222222222222",
      "targetType": "post",
      "targetId": "888888888888881",
      "reason": "spam",
      "details": "Spam details",
      "status": "pending",
      "resolveById": null,
      "modNote": null,
      "resolvedAt": null,
      "createdAt": "2026-08-21T00:00:00.000Z",
      "updatedAt": "2026-08-21T00:00:00.000Z"
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

---

## Жалобы и модерация (`/admin/reports`)

### `GET /admin/reports`
- **Доступ:** `admin`, `moderator`
- **Query-параметры:**
  - `status` *(string, опционально, `"all" | "pending" | "resolved" | "rejected"`, по умолчанию: `"all"`)*
  - `targetType` *(string, опционально, `"all" | "post" | "comment" | "user"`, по умолчанию: `"all"`)*
  - `reason` *(string, опционально, `"all" | "boundary_violation" | "inappropriate_content" | "toxicity" | "fraud_or_scam" | "spam" | "gender_mismatch" | "other"`, по умолчанию: `"all"`)*
  - `q` / `search` *(string, опционально)* — поиск по деталям, заметкам модератора, email/handle авторов и нарушителей
  - `limit` *(number, опционально, по умолчанию: 50, макс: 100)*
  - `offset` *(number, опционально, по умолчанию: 0)*
- **Ответ `200 OK`:**
  ```json
  {
    "success": true,
    "reports": [
      {
        "id": "999999999999991",
        "targetType": "post",
        "targetId": "888888888888881",
        "reason": "spam",
        "details": "Spam post details",
        "status": "pending",
        "modNote": null,
        "reporter": {
          "id": "111111111111111",
          "email": "reporter@wisal.dev",
          "name": "Reporter Name",
          "identity": "reporter_handle",
          "avatarKey": null
        },
        "reportedUser": {
          "id": "222222222222222",
          "email": "spammer@wisal.dev",
          "name": "Spammer Name",
          "identity": "spammer_handle",
          "avatarKey": null
        },
        "resolvedBy": null,
        "resolvedAt": null,
        "createdAt": "2026-08-21T00:00:00.000Z",
        "updatedAt": "2026-08-21T00:00:00.000Z"
      }
    ],
    "total": 1,
    "stats": {
      "pending": 1,
      "resolved": 0,
      "rejected": 0
    },
    "limit": 50,
    "offset": 0
  }
  ```

### `GET /admin/reports/:id`
- **Доступ:** `admin`, `moderator`
- **URL-параметры:**
  - `id` *(string, обязательное)* — Snowflake ID жалобы
- **Ответ `200 OK`:**
  ```json
  {
    "success": true,
    "report": {
      "id": "999999999999991",
      "targetType": "post",
      "targetId": "888888888888881",
      "reason": "spam",
      "details": "Spam post details",
      "status": "pending",
      "modNote": null,
      "reporter": {
        "id": "111111111111111",
        "email": "reporter@wisal.dev",
        "name": "Reporter Name",
        "identity": "reporter_handle",
        "avatarKey": null
      },
      "reportedUser": {
        "id": "222222222222222",
        "email": "spammer@wisal.dev",
        "name": "Spammer Name",
        "identity": "spammer_handle",
        "avatarKey": null
      },
      "resolvedBy": null,
      "resolvedAt": null,
      "createdAt": "2026-08-21T00:00:00.000Z",
      "updatedAt": "2026-08-21T00:00:00.000Z"
    }
  }
  ```

### `PATCH /admin/reports/:id`
- **Доступ:** `admin`, `moderator`
- **URL-параметры:**
  - `id` *(string, обязательное)* — Snowflake ID жалобы
- **Тело запроса (JSON):**
  - `status` *(string, обязательное, `"pending" | "resolved" | "rejected"`)*
  - `modNote` *(string | null, опционально, макс. 1000 симв.)* — служебная заметка модератора
- **Ответ `200 OK`:**
  ```json
  {
    "success": true,
    "report": {
      "id": "999999999999991",
      "targetType": "post",
      "targetId": "888888888888881",
      "reason": "spam",
      "details": "Spam post details",
      "status": "resolved",
      "modNote": "Post was removed and user warned",
      "reporter": {
        "id": "111111111111111",
        "email": "reporter@wisal.dev",
        "name": "Reporter Name",
        "identity": "reporter_handle",
        "avatarKey": null
      },
      "reportedUser": {
        "id": "222222222222222",
        "email": "spammer@wisal.dev",
        "name": "Spammer Name",
        "identity": "spammer_handle",
        "avatarKey": null
      },
      "resolvedBy": {
        "id": "111111111111111",
        "email": "admin@wisal.dev",
        "role": "admin"
      },
      "resolvedAt": "2026-08-21T01:00:00.000Z",
      "createdAt": "2026-08-21T00:00:00.000Z",
      "updatedAt": "2026-08-21T01:00:00.000Z"
    }
  }
  ```
