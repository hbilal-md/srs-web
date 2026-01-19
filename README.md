# SRS Web

Web-first spaced repetition system for board exam prep.

## Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────┐
│  PDF Pipeline   │────▶│   Supabase   │◀────│  Vercel UI  │
│  (local Python) │     │  (postgres)  │     │  (Next.js)  │
└─────────────────┘     └──────────────┘     └─────────────┘
        │                      │
        ▼                      │
   ┌─────────┐                 │
   │   S3    │◀────────────────┘
   │ (media) │
   └─────────┘
```

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env.local.example` to `.env.local` and update values if needed.

### 3. Set up Supabase

Run the SQL in `supabase-schema.sql` in your Supabase SQL Editor.

### 4. Run development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deployment to Vercel

1. Push this folder to a GitHub repository
2. Connect the repo to Vercel
3. Add environment variables in Vercel dashboard:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_KEY`
4. Deploy!

## Features

- **Review Flow**: FSRS-4.5 scheduling, keyboard shortcuts, mobile-friendly
- **Card Types**: Q/A, Cloze, Image Occlusion
- **Filtered Decks**: Create custom study sessions by topic/tags/state
- **Progress Tracking**: Pick up where you left off on any device
- **Breadcrumbs**: Link back to Obsidian reference notes

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/next` | Get next due card |
| POST | `/api/review` | Submit rating |
| GET | `/api/stats` | Get statistics |
| POST | `/api/cards/{id}/suspend` | Suspend card |
| POST | `/api/cards/{id}/flag` | Flag card |
| GET | `/api/decks` | List filtered decks |
| POST | `/api/decks` | Create deck |
| GET | `/api/decks/{id}/next` | Next card from deck |
| DELETE | `/api/decks/{id}` | Delete deck |
| POST | `/api/decks/{id}/reset` | Reset deck progress |

## Tech Stack

- **Frontend**: Next.js 14, React, Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **Hosting**: Vercel
- **Images**: AWS S3
- **Algorithm**: FSRS-4.5 (TypeScript port)
