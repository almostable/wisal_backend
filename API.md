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
      "shortDescription": null,
      "countryCode": null,
      "cityId": null,
      "contacts": {
        "telegram": "johndoe",
        "youtube": null,
        "website": null,
        "email": null
      },
      "identity": "johndoe",
      "regularFollowersCount": 0,
      "isVerified": false
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
- **Описание:** Возвращает системные данные учетной записи (аккаунта) и статус завершения онбординга.
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
    "isOnboardingCompleted": true
  }
  ```

### `DELETE /auth/me`
- **Доступ:** Авторизованный пользователь
- **Описание:** Soft delete учетной записи пользователя с анонимизацией (PII Scrubbing). Выполняет следующие действия:
  - Устанавливает `deleted_at = NOW()`.
  - Заменяет email на `<accountId>@deleted.invalid`, освобождая исходный email.
  - Очищает пароль на заведомо невалидное значение (`!ACCOUNT_DELETED!`).
  - Полностью удаляет все активные сессии пользователя.
  - Зануляет все поля профиля в `profiles` и удаляет хэндл из таблицы `identities`.
  - Переводит аватар пользователя в статус `deleted` в `media_uploads`.
  - Выполняет soft-delete всех постов пользователя (`deleted_at = NOW()`, `is_pinned = false`) и переводит медиа постов и комментариев под ними в статус `deleted`.
  - Удаляет закладки пользователя (`post_saves`) и лайки (`post_likes`, с декрементом счетчиков `likes_count` у постов), связи подписок (`follows`, с декрементом счетчиков `followers_count` у авторов) и блокировок (`user_blocks`).
  - Комментарии пользователя в чужих ветках сохраняются, но полностью обезличиваются (`name: null`, `identity: null`, `avatarKey: null`, `isMale: null`, `isDeleted: true`).
- **Тело запроса (JSON):**
  - `password` *(string, обязательное)* — текущий пароль пользователя для подтверждения удаления
- **Ответ `200 OK`:**
  ```json
  {
    "success": true,
    "message": "Account deleted successfully"
  }
  ```
- **Ошибки:**
  - `400 Bad Request` — не передан пароль
  - `401 Unauthorized` — не передан токен авторизации или указан неверный пароль (`"Invalid password"`)
  - `404 Not Found` — аккаунт не найден или уже удален


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
      "shortDescription": null,
      "countryCode": null,
      "cityId": null,
      "contacts": null,
      "identity": "johndoe",
      "regularFollowersCount": 0,
      "followersCount": 15,
      "isVerified": false
    },
    "isOnboardingCompleted": true
  }
  ```
  *Примечание:* Поле `followersCount` (общее число подписчиков) является приватным и отдается **только самому владельцу профиля** (в `GET /profile/me` и при просмотре своего профиля в `GET /profile/:identity`). Для других пользователей и в публичных лентах это поле скрыто.

### `POST /profile/onboarding`
- **Доступ:** Авторизованный пользователь
- **Тело запроса (JSON):**
  - `name` *(string, обязательное, мин. 1, макс. 100 симв.)* — отображаемое имя
  - `isMale` *(boolean, обязательное)* — пол (после онбординга неизменяем)
  - `identity` *(string, обязательное, мин. 5 симв. для обычных, мин. 3 симв. при наличии verified_at, макс. 32 симв.)* — уникальный юзернейм/хэндл. Должен начинаться с буквы (`[a-z]`), содержать только буквы, цифры и знаки подчёркивания (`^[a-z][a-z0-9_]*$`). Не может начинаться с цифры или состоять только из цифр.
  - `avatarKey` *(string, опционально)* — ключ аватара в хранилище
  - `description` *(string, опционально, мин. 1, макс. 2000 симв.)* — описание/биография
  - `shortDescription` *(string, опционально, мин. 1, макс. 110 симв.)* — краткое описание
  - `countryCode` *(string, опционально, ровно 2 симв. в верхнем регистре)* — код страны (ISO 3166-1 alpha-2)
  - `cityId` *(string, опционально, мин. 1, макс. 64 симв.)* — идентификатор города
  - `contacts` *(object, опционально)* — контакты (`telegram` username 4-32 симв., `youtube`, `website`, `email`)
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
      "shortDescription": null,
      "countryCode": null,
      "cityId": null,
      "contacts": null,
      "identity": "johndoe",
      "regularFollowersCount": 0,
      "isVerified": false
    }
  }
  ```

### `PATCH /profile/me`
- **Доступ:** Авторизованный пользователь
- **Тело запроса (JSON):**
  - `name` *(string, опционально, мин. 1, макс. 100 симв.)*
  - `identity` *(string, опционально, мин. 5 симв. для обычных, мин. 3 симв. при наличии verified_at, макс. 32 симв.)* — новый уникальный юзернейм/хэндл (начинается с буквы, не только цифры)
  - `avatarKey` *(string | null, опционально)*
  - `description` *(string | null, опционально, мин. 1, макс. 2000 симв.)*
  - `shortDescription` *(string | null, опционально, мин. 1, макс. 110 симв.)*
  - `countryCode` *(string | null, опционально, ровно 2 симв. в верхнем регистре)*
  - `cityId` *(string | null, опционально, мин. 1, макс. 64 симв.)*
  - `contacts` *(object | null, опционально)*
  - `isMale` *(boolean, опционально, допустимо только если пол ранее не был задан)*
> **Безопасность:** Поле `verified_at` защищено от изменения пользователем. Внешне отдаётся вычисляемое свойство `isVerified: boolean`.
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
      "shortDescription": "Solo Dev",
      "countryCode": "KZ",
      "cityId": "almaty",
      "contacts": {
        "telegram": "updated",
        "youtube": null,
        "website": null,
        "email": null
      },
      "identity": "johndoe",
      "regularFollowersCount": 0,
      "isVerified": false
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
- **Описание:** Возвращает список и количество регулярных читателей (подписчиков, открывавших хотя бы один пост автора за последние 30 дней).
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
        "followedAt": "2026-08-20T00:00:00.000Z",
        "lastReadAt": "2026-09-01T12:00:00.000Z"
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
        "followedAt": "2026-08-20T00:00:00.000Z",
        "lastReadAt": null
      }
    ],
    "total": 1,
    "limit": 50,
    "offset": 0
  }
  ```

### `GET /profile/:identity/followers`
- **Доступ:** Авторизованный пользователь
- **Описание:** Возвращает список и количество регулярных читателей автора (подписчиков с активными чтениями за последние 30 дней).
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
        "followedAt": "2026-08-20T00:00:00.000Z",
        "lastReadAt": "2026-09-01T12:00:00.000Z"
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

### `GET /profile/feed`
- **Доступ:** Авторизованный пользователь с онбордингом (`authMiddleware` + `onboardingMiddleware`)
- **Query-параметры:**
  - `type` *(string, опционально, `"recommended" | "random"`, по умолчанию: `"recommended"`)* — вид ленты профилей:
    - `recommended`: в выборку попадают **только верифицированные** пользователи (`verifiedAt != null`), отсортированные по убыванию постоянных читателей (`regular_followers_count DESC`, затем `id DESC`).
    - `random`: честное псевдослучайное перемешивание профилей через хэш-функцию `hashtext` со стабильной пагинацией по сгенерированному сервером сиду.
  - `seed` *(string, ровно 16 hex-символов `/^[a-f0-9]{16}$/`, опционально)* — сид для стабильной пагинации в режиме `type=random`:
    - **При первом запросе (`offset=0` или не указан):** клиент **не должен** передавать `seed` (попытка передать сид при `offset=0` вернет ошибку `400 Bad Request`). Сервер генерирует уникальный 16-символьный hex-сид автоматически и возвращает его в теле ответа.
    - **При пагинации (`type=random` и `offset > 0`):** клиент **обязан** передать ранее полученный от сервера `seed`. Запрос без сида при `offset > 0` вернет ошибку `400 Bad Request`.
    - **В режиме `type=recommended`:** передача `seed` **запрещена** (вернет ошибку `400 Bad Request`).
  - `limit` *(number, опционально, по умолчанию: 20, макс: 100)*
  - `offset` *(number, опционально, по умолчанию: 0)*
- **Бизнес-правила отбора профилей:**
  - Профиль завершил онбординг (заполнены `name`, `is_male`, `identity`).
  - Обязательно заполнены `country_code` и `short_description`.
  - В режиме `recommended` обязательно наличие `verified_at` (`isVerified = true`).
  - Исключаются пользователи, у которых есть взаимные блокировки со зрителем (`user_blocks`).
  - Исключается профиль самого зрителя.
  - Поле `followersCount` в ленте не отдается.
- **Ответ `200 OK` (режим `recommended`):**
  ```json
  {
    "success": true,
    "profiles": [
      {
        "name": "Alex Smith",
        "isMale": true,
        "avatarKey": "avatars/2026-09-01/111111111111111.jpg",
        "identity": "alexsmith",
        "shortDescription": "Tech writer & engineer",
        "regularFollowersCount": 42,
        "countryCode": "US",
        "cityId": "nyc",
        "isVerified": true
      }
    ],
    "type": "recommended",
    "limit": 20,
    "offset": 0
  }
  ```
- **Ответ `200 OK` (режим `random`, с полем `seed`):**
  ```json
  {
    "success": true,
    "profiles": [
      {
        "name": "Jane Doe",
        "isMale": false,
        "avatarKey": null,
        "identity": "janedoe",
        "shortDescription": "Designer & explorer",
        "regularFollowersCount": 15,
        "countryCode": "FR",
        "cityId": "paris",
        "isVerified": false
      }
    ],
    "type": "random",
    "seed": "3f8a09b1c2d4e5f6",
    "limit": 20,
    "offset": 0
  }
  ```
  *Примечание о жизненном цикле `seed`:*
  1. Клиент запрашивает `GET /profile/feed?type=random`.
  2. Сервер генерирует случайный 16-hex сид (например, `"3f8a09b1c2d4e5f6"`) и возвращает его в поле `seed`.
  3. Для получения следующей страницы клиент отправляет `GET /profile/feed?type=random&offset=20&seed=3f8a09b1c2d4e5f6`. Это обеспечивает стабильную выборку без перемешивания между страницами.

### `GET /profile/search`
- **Доступ:** Авторизованный пользователь с онбордингом (`authMiddleware` + `onboardingMiddleware`)
- **Query-параметры:**
  - `q` *(string, обязательное, от 1 до 100 символов)* — поисковый запрос (например, `alex`, `@it_guru`, `дизайнер`). Ведущий символ `@` автоматически отсекается.
  - `limit` *(number, опционально, по умолчанию: 20, макс: 100)*
  - `offset` *(number, опционально, по умолчанию: 0)*
- **Архитектура и производительность поиска:**
  - **Единое поисковое поле без мусора:** База данных автоматически формирует скрытую колонку `search_text`, склеивающую в нижнем регистре никнейм, имя и краткое описание пользователя (`lower(coalesce(identity, '') || ' ' || coalesce(name, '') || ' ' || coalesce(short_description, ''))`). Полное длинное описание исключено из поискового индекса для экономии памяти и мгновенного обновления профилей.
  - **Мгновенный первичный отсев по триграммному GIN-индексу:** Запрос отсекает 99% базы за доли миллисекунды одним индексным условием `search_text LIKE '%query%'`.
- **Иерархия ранжирования совпадений (5 уровней):**
  1. **Уровень 1 (Высший приоритет):** Точный никнейм целиком (нахождение конкретного человека).
  2. **Уровень 2:** Никнейм начинается с введенных букв (быстрый автокомплит ника).
  3. **Уровень 3:** Имя профиля начинается с запроса или любое отдельное слово в названии начинается с него (например, по запросу «клуб» найдется «IT Клуб»).
  4. **Уровень 4:** Запрос встретился где-то в середине ника или названия.
  5. **Уровень 5 (Базовый):** Слово найдено только в кратком описании.
- **Вторичная сортировка внутри уровня:**
  - Сначала идут верифицированные аккаунты (`isVerified: true`).
  - Затем аккаунты по убыванию числа постоянных читателей (`regularFollowersCount DESC`).
  - Стабильный порядок по уникальному Snowflake ID (`id DESC`).
- **Бизнес-правила фильтрации:**
  - Исключаются пользователи с взаимными блокировками со зрителем (`user_blocks`).
  - Исключается профиль самого зрителя.
  - Исключаются аккаунты, не завершившие онбординг.
  - Поле `followersCount` в поисковой выдаче не отдается.
- **Ответ `200 OK`:**
  ```json
  {
    "success": true,
    "profiles": [
      {
        "name": "Alex Smith",
        "isMale": true,
        "avatarKey": "avatars/2026-09-01/111111111111111.jpg",
        "identity": "alexsmith",
        "shortDescription": "Tech writer & engineer",
        "regularFollowersCount": 42,
        "countryCode": "US",
        "cityId": "nyc",
        "isVerified": true
      }
    ],
    "total": 1,
    "limit": 20,
    "offset": 0
  }
  ```

### `GET /profile/:identity`
- **Доступ:** Авторизованный пользователь
- **URL-параметры:**
  - `identity` *(string, обязательное)* — юзернейм/хэндл пользователя
- **Поведение при блокировке:**
  - Если авторизованный пользователь заблокировал автора (`isBlocked: true`) или заблокирован автором (`isHidden: true`): возвращаются только `id`, `name`, `identity`, `isMale` (аватарка, описание, контакты отсутствуют).
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
      "shortDescription": null,
      "countryCode": null,
      "cityId": null,
      "contacts": {
        "telegram": "johndoe",
        "youtube": null,
        "website": null,
        "email": null
      },
      "identity": "johndoe",
      "regularFollowersCount": 0,
      "isVerified": false,
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
      "shortDescription": null,
      "countryCode": null,
      "cityId": null,
      "contacts": null,
      "identity": "johndoe",
      "regularFollowersCount": 0,
      "isVerified": false,
      "isFollowing": false,
      "isBlocked": true
    }
  }
  ```

---

## Загрузка медиафайлов (`/uploads`)

Двухшаговая загрузка медиафайлов (изображений) в Cloudflare R2 по Presigned URL с контролем жизненного цикла в PostgreSQL (`media_uploads`), IDOR-защитой и автоматическим сборщиком мусора (GC Worker).

### Жизненный цикл медиафайлов
- `pending`: Ссылка выдана (`POST /uploads/presign`), загрузка ожидается. Если файл не был привязан в течение 24 часов (`created_at < NOW() - INTERVAL '24 HOURS'`), ночной GC Worker удаляет его из R2 и переводит в `purged`.
- `attached`: Файл успешно привязан к посту, комментарию или а profile avatar. Не обрабатывается сборщиком мусора.
- `deleted`: Пост, комментарий или аватар удален/заменен пользователем. Файл отправляется на удаление из R2 в ближайшем цикле GC.
- `purged`: Файл физически стерт из R2 через S3 API `DeleteObjects`, запись оставлена для аудита. Физически удаляется из базы данных через 90 дней.

### Архитектурный Flow
1. Клиент запрашивает ссылку: `POST /uploads/presign { "ext": "jpg", "contentType": "image/jpeg", "size": 1048576 }`.
2. API валидирует расширение, MIME-тип и размер (до 10MB), создает запись в `media_uploads` со `status = 'pending'`, и возвращает `200 OK` с `uploadUrl` (строгий TTL 15 минут, 900с) и `fileKey` (`media/YYYY-MM-DD/<snowflake>.jpg`).
3. Клиент загружает бинарный файл напрямую в Cloudflare R2 через HTTP `PUT <uploadUrl>` с заголовком `Content-Type: image/jpeg` (и `Content-Length`, если `size` был указан).
4. Клиент использует `fileKey` в бизнес-логике:
   - Обновление аватара профиля: `PATCH /profile/me { "avatarKey": "media/..." }`
   - Создание публикации с фото: `POST /posts { "type": "media", "payload": { "media": [{ "fileKey": "media/...", "width": 1920, "height": 1080 }] }, "content": "..." }`
   - Добавление комментария с фото: `POST /posts/:id/comments { "type": "media", "payload": { "media": [{ "fileKey": "media/...", "width": 800, "height": 600 }] }, "content": "..." }`
5. **Защита от подмены чужих файлов (IDOR):**
   При привязке файлов к сущности сервер атомарно проверяет, что каждый `fileKey` принадлежит текущему пользователю и имеет `status = 'pending'`. Если хотя бы один файл чужой, уже привязанный или не существует, запрос отклоняется с ошибкой `400 Bad Request`.
6. **Каскадное удаление:**
   При soft-delete поста или комментария привязанные медиафайлы переводятся в `deleted`. При удалении поста медиафайлы его комментариев также переводятся в `deleted`. Ночной GC Worker пакетами до 1000 ключей очищает удаленные файлы из хранилища R2.

### `POST /uploads/presign`
- **Доступ:** Авторизованный пользователь (`Authorization: Bearer <token>`)
- **Тело запроса (JSON):**
  - `ext` *(string, обязательное, `"jpg" | "jpeg" | "png" | "webp"`)* — расширение файла
  - `contentType` *(string, обязательное)* — MIME-тип (`image/jpeg`, `image/png`, `image/webp`)
  - `size` *(number, опционально, целое положительное число, до 10485760 байт (10MB))* — размер файла в байтах
- **Ответ `200 OK`:**
  ```json
  {
    "success": true,
    "uploadUrl": "https://<account_id>.r2.cloudflarestorage.com/wisal-media/media/2026-08-30/723491823749128301.jpg?X-Amz-Algorithm=...",
    "fileKey": "media/2026-08-30/723491823749128301.jpg",
    "expiresIn": 900
  }
  ```
- **Ошибки:**
  - `400 Bad Request` — неподдерживаемое расширение, несовпадающий MIME-тип или недопустимый размер файла (>10MB или non-positive).
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
      "savesCount": 0,
      "likesCount": 0,
      "commentsCount": 0,
      "viewsCount": 0,
      "isSaved": false,
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
      "savesCount": 0,
      "likesCount": 0,
      "commentsCount": 0,
      "viewsCount": 0,
      "isSaved": false,
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

### `POST /posts/views`
- **Доступ:** Авторизованный пользователь с онбордингом
- **Описание:** Пакетное засчитывание (инкремент) просмотров для одного или нескольких постов. Обновляет счетчик `views_count` одним SQL-запросом. Не затрагивает метку `updated_at`. Удаленные посты (`deleted_at IS NOT NULL`) игнорируются.
- **Тело запроса (JSON):**
  - `postIds` *(array of string, обязательное, от 1 до 100 элементов)* — массив Snowflake ID постов
  ```json
  {
    "postIds": ["999999999999991", "999999999999992"]
  }
  ```
- **Ответ `200 OK`:**
  ```json
  {
    "success": true,
    "updatedCount": 2
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
      "savesCount": 0,
      "likesCount": 0,
      "commentsCount": 0,
      "viewsCount": 0,
      "isSaved": false,
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

### `POST /posts/:id/save`
- **Доступ:** Авторизованный пользователь с онбордингом (с учетом прав `gender_scope` и `access_level`)
- **URL-параметры:**
  - `id` *(string, обязательное)* — Snowflake ID поста
- **Ответ `200 OK`:**
  ```json
  {
    "success": true,
    "saved": true,
    "savesCount": 1,
    "message": "Post saved successfully"
  }
  ```
  *Примечание:* Поле `savesCount` передается в ответе только если текущий пользователь является автором поста. Для сторонних пользователей поле опускается.

### `POST /posts/:id/unsave`
- **Доступ:** Авторизованный пользователь с онбордингом (с учетом прав `gender_scope` и `access_level`)
- **URL-параметры:**
  - `id` *(string, обязательное)* — Snowflake ID поста
- **Ответ `200 OK`:**
  ```json
  {
    "success": true,
    "saved": false,
    "savesCount": 0,
    "message": "Post unsaved successfully"
  }
  ```
  *Примечание:* Поле `savesCount` передается в ответе только если текущий пользователь является автором поста. Для сторонних пользователей поле опускается.

### `POST /posts/:id/like`
- **Доступ:** Авторизованный пользователь с онбордингом (с учетом прав `gender_scope` и `access_level`)
- **URL-параметры:**
  - `id` *(string, обязательное)* — Snowflake ID поста
- **Поведение:** Если публикация ограничена охватом `same_gender` и пол пользователя не совпадает с полом автора, или пользователь заблокирован, сервер возвращает `404 Not Found` (`{"error": "Post not found"}`).
- **Ответ `200 OK`:**
  ```json
  {
    "success": true,
    "liked": true,
    "likesCount": 1,
    "message": "Post liked successfully"
  }
  ```
  *Примечание:* Поле `likesCount` передается в ответе только если текущий пользователь является автором поста. Для сторонних пользователей поле опускается.

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
  *Примечание:* Поле `likesCount` передается в ответе только если текущий пользователь является автором поста. Для сторонних пользователей поле опускается.

### `GET /posts/saves`
- **Доступ:** Авторизованный пользователь с онбордингом
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
        "content": "Saved post content",
        "genderScope": "all",
        "accessLevel": "public",
        "isPinned": false,
        "commentsCount": 2,
        "viewsCount": 0,
        "isSaved": true,
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
  *Примечание:* Посты упорядочены по времени сохранения (`desc`). Поля `savesCount` и `likesCount` включаются только для публикаций, автором которых является сам пользователь.

### `GET /posts/feed`
- **Доступ:** Авторизованный пользователь с онбордингом
- **Поведение:** Отдает исключительно публикации авторов, на которых подписан пользователь (`following`), в обратном хронологическом порядке (`desc(posts.createdAt)`). Общей ленты больше нет.
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
        "content": "Feed post",
        "genderScope": "all",
        "accessLevel": "public",
        "isPinned": false,
        "commentsCount": 2,
        "viewsCount": 0,
        "isSaved": true,
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
      "savesCount": 10,
      "likesCount": 25,
      "commentsCount": 4,
      "viewsCount": 15,
      "isSaved": true,
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
  *Примечание:* Поля `savesCount` и `likesCount` передаются только если текущий пользователь является автором поста. Для других пользователей эти поля не отображаются.

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
        "commentsCount": 1,
        "viewsCount": 0,
        "isSaved": false,
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
> - **Поведение при блокировке:**
>   - Если комментарий или реплай написан пользователем, с которым есть взаимная блокировка (заблокирован зрителем или заблокировал зрителя), текст комментария (`content`) и вложения (`payload`) остаются доступными, но `author.avatarKey` скрыт (`null`), и проставляется флаг `isBlocked: true` (если заблокирован зрителем) или `isHidden: true` (если зритель заблокирован автором).
>   - Попытка ответить (`createComment` с `parentId` или `replyToComment`) на комментарий заблокированного пользователя или пользователя, который вас заблокировал, отклоняется с ошибкой `400 Bad Request` (`"Cannot reply to a blocked user"`).
> - **Поведение при удалении аккаунта автора (PII Scrubbing):**
>   - Комментарии удаленных пользователей сохраняются в ветках для сохранения контекста диалога.
>   - Поля авторства в объекте `author` возвращаются пустыми (`name: null`, `identity: null`, `avatarKey: null`, `isMale: null`), и проставляется флаг `isDeleted: true`.
>   - Если адресат ответа (`replyToUser`) был удален, объект содержит `{ id, name: null, identity: null, isDeleted: true }`.
>   - Для активных пользователей флаг `isDeleted` опускается (отсутствует в JSON).

### `GET /posts/:id/comments`
- **Доступ:** Авторизованный пользователь с онбордингом (с учетом прав доступа к посту)
- **Описание:** Возвращает только комментарии нулевого уровня (Level 0, корневые комментарии к посту). Реплаи Level 1 запрашиваются отдельно через `GET /posts/comments/:id/replies`.
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
        "rootId": null,
        "branchId": null,
        "parentId": null,
        "replyToUserId": null,
        "replyToUser": null,
        "type": "text",
        "payload": {},
        "content": "First comment on post",
        "repliesCount": 2,
        "createdAt": "2026-08-20T00:00:00.000Z",
        "updatedAt": "2026-08-20T00:00:00.000Z",
        "editedAt": null,
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
- **Описание:** Унифицированный эндпоинт получения ответов следующего уровня:
  - Если передан ID комментария **Level 0 (Root)**: возвращает список комментариев **Level 1 (ветки/branches)**.
  - Если передан ID комментария **Level 1 (Branch)**: возвращает список комментариев **Level 2 (ответы внутри ветки)**.
  - Если передан ID комментария **Level 2**: возвращает пустой список (`comments: []`, так как дальнейшей вложенности нет).
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
        "rootId": "888888888888881",
        "branchId": null,
        "parentId": "888888888888881",
        "replyToUserId": "111111111111111",
        "replyToUser": {
          "id": "111111111111111",
          "name": "John Doe",
          "identity": "johndoe"
        },
        "type": "text",
        "payload": {},
        "content": "Reply to first comment (Level 1 branch)",
        "repliesCount": 1,
        "createdAt": "2026-08-20T00:01:00.000Z",
        "updatedAt": "2026-08-20T00:01:00.000Z",
        "editedAt": null,
        "author": {
          "id": "222222222222222",
          "name": "Jane Smith",
          "identity": "janesmith",
          "avatarKey": null,
          "isMale": false
        }
      }
    ],
    "total": 1,
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
  - `payload` *(object, обязательное для `type: "media"`, по умолчанию: `{}`)*
  - `parentId` *(string | null, опционально)* — Snowflake ID родительского комментария:
    - если `null` или не передан — создается комментарий **Level 0 (Root)**;
    - если указан ID Level 0 — создается ветка **Level 1 (Branch)**;
    - если указан ID Level 1 или Level 2 — создается ответ **Level 2**.
- **Ответ `201 Created`:**
  ```json
  {
    "success": true,
    "comment": {
      "id": "888888888888881",
      "postId": "999999999999991",
      "authorId": "111111111111111",
      "rootId": null,
      "branchId": null,
      "parentId": null,
      "replyToUserId": null,
      "replyToUser": null,
      "type": "text",
      "payload": {},
      "content": "First comment on post",
      "repliesCount": 0,
      "createdAt": "2026-08-20T00:00:00.000Z",
      "updatedAt": "2026-08-20T00:00:00.000Z",
      "editedAt": null,
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
  - `id` *(string, обязательное)* — Snowflake ID комментария, на который дается ответ
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
      "rootId": "888888888888881",
      "branchId": null,
      "parentId": "888888888888881",
      "replyToUserId": "111111111111111",
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
      "editedAt": null,
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
      "rootId": null,
      "branchId": null,
      "parentId": null,
      "replyToUserId": null,
      "replyToUser": null,
      "type": "text",
      "payload": {},
      "content": "Edited comment text",
      "repliesCount": 2,
      "createdAt": "2026-08-20T00:00:00.000Z",
      "updatedAt": "2026-08-20T00:05:00.000Z",
      "editedAt": "2026-08-20T00:05:00.000Z",
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
      "resolvedById": null,
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
        "resolvedById": null,
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
      "resolvedById": null,
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
  - `q` / `search` *(string, опционально)* — поиск по email или точный поиск по ID администратора
  - `role` *(string, опционально, `"all" | "admin" | "moderator"`, по умолчанию: `"all"`)* — фильтр по роли
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
  - `q` / `search` *(string, опционально)* — поиск по email, имени, никнейму или точный поиск по Snowflake ID пользователя
  - `status` *(string, опционально, `"all" | "onboarded" | "pending" | "verified" | "unverified"`, по умолчанию: `"all"`)* — фильтр по статусу онбординга или верификации
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
          "shortDescription": null,
          "countryCode": null,
          "cityId": null,
          "contacts": null,
          "identity": null,
          "regularFollowersCount": 0,
          "isVerified": false
        }
      }
    ],
    "total": 1,
    "limit": 50,
    "offset": 0
  }
  ```

### `GET /admin/users/:id`
- **Доступ:** `admin`, `moderator`
- **URL-параметры:**
  - `id` *(string / snowflake, обязательное)* — идентификатор аккаунта пользователя
- **Ответ `200 OK`:**
  ```json
  {
    "success": true,
    "user": {
      "id": "100000000000000",
      "email": "user@wisal.dev",
      "createdAt": "2026-08-18T00:00:00.000Z",
      "updatedAt": "2026-08-18T00:00:00.000Z",
      "profile": {
        "id": "200000000000000",
        "name": "User Name",
        "isMale": true,
        "avatarKey": null,
        "description": "User bio",
        "shortDescription": null,
        "countryCode": null,
        "cityId": null,
        "contacts": null,
        "identity": "username",
        "regularFollowersCount": 10,
        "isVerified": true
      }
    }
  }
  ```

### `PATCH /admin/users/:id`
- **Доступ:** `admin`, `moderator`
- **URL-параметры:**
  - `id` *(string / snowflake, обязательное)* — идентификатор аккаунта пользователя
- **Тело запроса (JSON):**
  - `name` *(string, опционально, мин. 1, макс. 100 симв.)*
  - `identity` *(string, опционально, мин. 3-32 симв. для верифицированных, мин. 5-32 симв. для не верифицированных)*
  - `isMale` *(boolean, опционально)* — модератор/админ может корректировать пол пользователя
  - `avatarKey` *(string | null, опционально)*
  - `description` *(string | null, опционально, мин. 1, макс. 2000 симв.)*
  - `shortDescription` *(string | null, опционально, мин. 1, макс. 110 симв.)*
  - `countryCode` *(string | null, опционально, ровно 2 симв. в верхнем регистре)*
  - `cityId` *(string | null, опционально, мин. 1, макс. 64 симв.)*
  - `contacts` *(object | null, опционально)*
  - `isVerified` *(boolean, опционально)* — управление верификацией: при `true` сервер устанавливает текущую дату в `verified_at`, при `false` сбрасывает `verified_at` в `null`.
- **Ответ `200 OK`:**
  ```json
  {
    "success": true,
    "user": {
      "id": "100000000000000",
      "email": "user@wisal.dev",
      "createdAt": "2026-08-18T00:00:00.000Z",
      "updatedAt": "2026-08-18T00:00:00.000Z",
      "profile": {
        "id": "200000000000000",
        "name": "Updated Name",
        "isMale": true,
        "avatarKey": null,
        "description": "Updated bio",
        "shortDescription": null,
        "countryCode": null,
        "cityId": null,
        "contacts": null,
        "identity": "updated_user",
        "regularFollowersCount": 10,
        "isVerified": true
      }
    }
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
