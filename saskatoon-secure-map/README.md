# Saskatoon Block Finder

Private mobile-first Next.js + MapLibre + Supabase map for Saskatoon.

## Vercel
Keep **Root Directory** exactly:

`saskatoon-secure-map`

Set these Environment Variables in Vercel:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Never put a Supabase `service_role` / secret key in browser code or any `NEXT_PUBLIC_...` variable.

## Supabase SQL (fresh rebuild)
For a brand-new database, run `supabase/install-all-fresh-project.sql` once.

The component migrations are also kept separately:
1. `supabase/schema.sql`
2. `supabase/driven-routes.sql`
3. `supabase/drive-draft-recovery.sql`

After signing up your first admin, run the one-line `update public.profiles ...` example at the bottom of `schema.sql`, changing it to your actual email.

## Supabase Auth URL settings
Add your production Vercel URL to Supabase Auth Site URL / Redirect URLs. Password-reset emails return through `/auth/callback?next=/reset-password`.

## Security
- Browser uses only the Supabase publishable/anon key.
- Server API routes verify the signed-in user and approved/admin status.
- Database RLS independently protects profiles, admin routes, manual hydrants, owner-only driven routes, and owner-only drive drafts.
- Blocked/pending users cannot use protected APIs, and the map polls account access and uses `window.location.replace()` when access is lost.

## Preserved behavior
- OSM raster MapLibre map; tap-to-address lookup.
- GPS arrow, N/E/S/W compass, zoom controls, 3-dot menu.
- Follow Lock never changes the user's chosen zoom.
- Automatic night 7 PM–7 AM; manual override expires at next 7 AM/7 PM boundary.
- No voice navigation. No destination/address navigation.
- No hard-coded routes.
- Admin GPX routes from Supabase; red planned route.
- Drive/Drive Route show actual driven trace blue but do **not** create save prompts when stopped.
- Make New Route records blue, can save privately, then displays red; private routes are marked 🔒.
- Pause/resume starts a fresh GPS segment to avoid fake straight lines.
- Wake Lock is best effort and retried on visibility/tap.
- Draft saved locally immediately and server-synced at least every 5 seconds while recording; sign-out force-syncs first.
- Recovery starts a new segment after close/crash; stopped unsaved Make New Route restores blue with Save/Discard.
- Hydrants load city-wide through authenticated server-side ArcGIS POST/object-ID batching, merge manual hydrants, and refresh every 15 minutes while ON.
- Turning hydrants OFF increments an invalidation epoch so an in-flight request cannot make them reappear.
- Admin hydrant picker shows existing + manual hydrants, full screen, multi-pick, undo/clear/bulk-add.
- Recording controls are vertically separated: Stop top, Pause middle, Follow bottom; Stop/Follow are hard-hidden after stopping.
