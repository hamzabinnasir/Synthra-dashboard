@AGENTS.md

# Project memory (read this first, keep it short, update at the end of every stage)

Purpose of this file: persistent context so a new Claude session/account can continue without re-explaining.
Do NOT read or print `.env.local` (secrets). Use `.env.example` to see variable names.

## What this repo is
- Social assistant dashboard (package `whatsapp-dashboard`, brand "Synthra"): admin inbox + AI-bot controls for
  **WhatsApp**, **Facebook** and **Instagram** (DMs + comment moderation), notifications, profile, auth.
- Web app: Next.js 16 (App Router, JavaScript, Tailwind 4, React 19) in `src/app`, shared server code in `lib/`.
- Database: Supabase (service-role client in `lib/supabase.js`; comments/FB data may use a separate project via
  `lib/facebook-supabase.js` `getFacebookSupabase()`, falling back to the default). Media via Cloudinary.
- **Mobile app (in progress): Flutter, folder `mobile/`**, package `synthra_mobile`, org `com.synthra`, Android + iOS.
  It is a thin client over the existing `/api/*` routes. No business logic is duplicated in Dart.
- Git: work on branch `flutter-app`, one commit per stage.

## Web backend facts (verified)
- Auth: `admin_users` table, PBKDF2 password hash, HS256 JWT (`lib/auth.js`). Web uses httpOnly cookie
  `admin_session`. **Mobile uses `Authorization: Bearer <jwt>`**; login with header `x-client-platform: mobile`
  returns `{ success, token, user }` (30-day token). `src/middleware.js` protects everything except
  `/api/auth/*` (login, logout, forgot-password, reset-password); API 401 => `{ success:false, error:'Unauthorized' }`.
  `getCurrentAdmin()` accepts the request, a cookie store, or (fallback) the Bearer header from `next/headers`, so
  routes using `getCurrentAdmin(await cookies())` also work for mobile. `GET /api/admin/profile` => `{ user }`.
  `POST /api/auth/forgot-password { email }` emails a WEB link `/reset-password?token=...`;
  `POST /api/auth/reset-password { token, newPassword }` (min 8 chars). The app's reset screen accepts the pasted link/token.
- IDs: WhatsApp conversation id `psid` = `wa_<digits>`, Instagram `ig_<id>`, Facebook = plain PSID.
  Tables: `customers` (conversations), `messages`, `comments`, `activity_logs`, `bot_settings`, `admin_users`,
  `device_tokens` (new, see `supabase/migrations/20261026_device_tokens.sql`).
- Responses are `{ success, ... }` JSON; errors carry `error` string.
- Key routes:
  - `GET /api/inbox/list?platform=whatsapp|facebook|instagram` => `{ customers[] }` (max 100, newest first)
  - `GET /api/conversation/[id]/messages?after=<iso>|full=1` (WhatsApp only, `wa_` ids) => `{ messages[] }`
  - `POST /api/send-message { psid, message }` (WhatsApp text), `/api/send-media`, `/api/toggle-bot`,
    `/api/conversation/edit-name`, `/api/conversation/mark-read`, `/api/delete-conversation`, `/api/delete-message`
  - Facebook: `/api/facebook/inbox/[id]/messages`, `/api/facebook/send-message`, `/api/facebook/toggle-bot`,
    `/api/facebook/global-settings`, `/api/facebook/delete-comment`, `/api/facebook/delete-all-comments`
  - Comments: `GET /api/comments?platform=facebook|instagram` (NEW, for mobile) => `{ comments[], bot_active }`;
    `GET /api/comments/replies?ids=a,b`, `/api/comments/sync`, `/api/comments/list` (ids only)
  - Notifications: `/api/notifications`, `/counts`, `/mark-all-read`, `/settings`
  - Devices (NEW): `POST/DELETE /api/devices { token, platform }` registers FCM tokens
  - `GET /api/media-proxy` proxies media
- Realtime = Server-Sent Events (`/api/inbox/events?platform=`, `/api/conversation/[id]/events`,
  `/api/comments/events`, `/api/notifications/events`). Inbox events: `ready`, `customer-inserted`,
  `customer-updated`, `customer-deleted`, `new-message-activity`, `all-conversations-deleted`, `realtime-error`.
  15s keep-alive comments. SSE only works while the app is foreground; background alerts need FCM push.
- Not yet reviewed in detail: Instagram message routes, `send-media`, notifications payloads, profile route,
  `lib/facebook-graph.js`, `lib/enrich-customers.js`. Read the route file before writing the Dart model for it.

## Mobile app plan (Flutter)
Stack: flutter_riverpod 3, go_router 18, dio, flutter_secure_storage, cached_network_image, intl
(later: firebase_messaging, image_picker/file_picker). Check current package APIs before coding (versions are new).
Structure: `mobile/lib/{core,features}`; features = auth, inbox, chat, comments, notifications, profile.
Base URL via `--dart-define=API_BASE_URL=https://...` (Android emulator reaches host at `http://10.0.2.2:3000`).
Dark + light theme matching web dashboard.

### Stage status
1. Backend for mobile (Bearer auth, `/api/comments`, `/api/devices` + SQL migration) - DONE
2. Flutter foundation: API client, secure session, login, forgot/reset password - DONE
   (`mobile/lib/core` = config/theme/router/api_client/token storage; `features/auth` = controller, repo, screens;
   `features/home` = placeholder. `flutter analyze` clean, 11 tests pass. Not yet run on a device/emulator.)
3. Inbox (WA/FB/IG) + chat screen, live updates, send text/media, bot toggle, rename, delete - CODE COMPLETE, NOT VERIFIED
   (`features/inbox` = domain/data/application/presentation. Media send added last: `domain/attachment.dart`,
   `ChatRepository.sendMedia`, `widgets/attachment_flow.dart`, paperclip in composer for WhatsApp chats only.
   `POST /api/send-media` is WhatsApp-only, multipart fields `psid`, `caption`, `file`, returns `{ success, message }`;
   limits: images jpg/png 5 MB, video mp4/3gp, audio aac/m4a/mp3/amr/ogg, docs pdf/office/txt up to 10 MB.
   Packages added: image_picker ^1.1.2, file_picker ^13.1.0 (static API: `FilePicker.pickFile`). iOS Info.plist
   camera/photo strings added. TODO: `flutter pub get; flutter analyze`, test on a device, then mark DONE + commit.)
4. Comments (FB/IG): list, reply, private reply, delete, bot toggle - CODE COMPLETE, NOT VERIFIED
   (`features/comments`; tabs FB/IG in `CommentsPage`; live via `/api/comments/events` + 30s sync poll.)
5. Notifications center, profile, theme - CODE COMPLETE, NOT VERIFIED (VS Code Dart diagnostics clean; `flutter analyze`/tests not run)
   (`features/notifications` = list with client-side filters, mark read/all, delete/clear, settings sheet, in-app banner
   for live events; `/api/notifications` rows: id, platform, type, source_type, target_id, customer_*, message_preview,
   is_read, created_at. Tap opens `/chat/:target_id` or the Comments tab. `features/profile` = name, password, theme,
   sign out via `POST /api/admin/profile`. `core/theme_mode.dart` stores light/dark/system in secure storage.
   Home has 4 tabs (Inbox, Comments, Alerts with unread badge, Profile) driven by `homeTabProvider`.
   Riverpod gotcha: `AsyncNotifier.update` already exists, do not name a method `update`.)
   Profile photo upload/remove: DONE in code (tap the avatar on the Profile tab; `ProfileRepository.updateAvatar/removeAvatar`
   send a base64 data URL in `avatar` to `POST /api/admin/profile`; server accepts JPEG/PNG/WebP up to 5 MB, `null` removes it).
   Not run on a device yet; `flutter pub get` + `flutter analyze` were clean before the sound work.
   Sound alerts: code written, `flutter pub get` + `flutter analyze` clean (added `flutter_ringtone_player_plus`;
   `core/alert_sound.dart` plays `FlutterRingtonePlayer().playNotification()`; Sound toggle in the notification settings
   sheet; played from `NotificationsController._onNew` when `soundEnabled` and not muted/DND). Flutter's
   `SystemSound.alert` is silent on Android, hence the plugin. Verify it compiles and the sound plays on a device.
   STILL TODO: FCM push (needs Firebase project + `google-services.json`, `firebase_messaging`, a backend sender that
   reads `device_tokens`, and `POST /api/devices` registration from the app).
   Known nit: `NotificationsState.copyWith(incoming: null)` cannot clear `incoming` (`??` fallback); harmless today
   because the home screen compares with `identical`.
6. Polish, error/empty states, offline cache, release builds - TODO

## Working conventions
- Dev machine is Windows + PowerShell 5: no `&&` (use `;`); the shell tool prefixes `cd <cwd> &&`, so never use its
  `cwd` option. Run `cd mobile; <cmd>` inside the command. The terminal's working directory PERSISTS between calls,
  so `cd` back to the repo root before git/npm commands.
- `npm run lint` / eslint ignores `lib/`; check those files with `node --check <file>`.
- Run web: `npm run dev` (port 3000). Run mobile: `cd mobile; flutter run --dart-define=API_BASE_URL=...`.
- Verify with `flutter analyze` / `npm run lint` before each commit. Commit message format: `Stage N: <summary>`.
- At the end of each stage: update "Stage status" above and any new verified facts, then commit.
