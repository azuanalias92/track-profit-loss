# Track P&L

Track your trading profit and loss with confidence.

## Architecture

- **Frontend**: Next.js 16 (React 19) — neo-brutalism design
- **Backend**: Cloudflare Workers + Hono + D1
- **Auth**: Google OAuth

## Setup

### Prerequisites
- Node.js 20+
- Cloudflare account
- Google OAuth credentials

### API Setup

```bash
# Install dependencies
npm install

# Create D1 database
npx wrangler d1 create track-pnl-db

# Update wrangler.jsonc with the database_id

# Set secrets
npx wrangler secret put GOOGLE_CLIENT_SECRET

# Set env vars (already in wrangler.jsonc [vars])
# GOOGLE_CLIENT_ID — update with your Google OAuth client ID

# Apply migrations
npx wrangler d1 migrations apply track-pnl-db --remote

# Deploy
npx wrangler deploy
```

### Frontend Setup

```bash
cd frontend
npm install

# Set API URL in .env.local
NEXT_PUBLIC_API_URL=https://track-profit-loss.traone.workers.dev

# Run locally
npm run dev

# Build for production
npm run build
```

### Deploy Frontend (Vercel)

```bash
cd frontend
npx vercel --prod
```
