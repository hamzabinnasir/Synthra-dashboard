This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.js`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Synthra Configuration

Copy `.env.example` to `.env.local`, then fill in the Supabase and WhatsApp credentials. Keep `SUPABASE_SERVICE_ROLE_KEY` and `WHATSAPP_ACCESS_TOKEN` server-only; do not prefix them with `NEXT_PUBLIC_`.

Set `NEXT_PUBLIC_APP_URL` to the origin serving the app. Use `http://localhost:3000` locally and replace it with the hosted HTTPS origin when deploying. Browser API requests and metadata use this value.

`WHATSAPP_GRAPH_API_URL` is the WhatsApp Graph API base URL and version. `NEXT_PUBLIC_SUPABASE_URL` is the Supabase project URL. Both are configured through environment variables.

## Facebook Dashboard Integration

The unified dashboard keeps the Facebook bot database separate from the WhatsApp database. Set the server-only `FACEBOOK_SUPABASE_URL` and `FACEBOOK_SUPABASE_SERVICE_ROLE_KEY` variables to the Facebook project used by `backend/.env` (`SUPABASE_URL` and `SUPABASE_SERVICE_KEY`). Never prefix the Facebook service key with `NEXT_PUBLIC_`.

For a new Facebook bot database, apply `supabase/schema.sql` and the required migrations. For an existing database, apply `supabase/migrations/20261004_platform_bot_controls.sql` to add the separate Facebook/Instagram global inbox and comment switches. Per-comment bot switches are no longer used. Set the two Facebook variables in local `.env.local` and the deployed dashboard environment, then restart or redeploy the dashboard.

For Instagram Login, also set the server-only `IG_ACCESS_TOKEN` and optional `INSTAGRAM_GRAPH_VERSION` in `.env.local` and the deployed dashboard environment. The backend uses the same Instagram Login token in `backend/.env`; do not expose it with a `NEXT_PUBLIC_` variable.
