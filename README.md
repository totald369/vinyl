# Map-based Store Service Starter

## Frontend
- Next.js (App Router)
- Tailwind CSS
- Zustand

## Backend
- Supabase PostgreSQL + API
- Migration: `backend/supabase/migrations/0001_init.sql`

## Features Included
1. Map-based store search skeleton
2. List modes:
   - `defaultRegion` (Gangnam)
   - `myLocation` (distance-based)
3. Location permission fallback:
   - granted: current location
   - denied: Gangnam fallback
4. Product filters:
   - 종량제 봉투
   - 불연성 마대
   - 폐기물 스티커
5. Name/address search
6. Store detail page
7. Report new store page
8. Edit store request page

## State Shape (Zustand)
- `permission: unknown | granted | denied`
- `listMode: defaultRegion | myLocation`
- `contentState: loading | ready | empty | error`

## Run Frontend
```bash
cd frontend
npm install
cp .env.example .env.local
# set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev
```
