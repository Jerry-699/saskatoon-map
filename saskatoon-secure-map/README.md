# Saskatoon Secure Map

## Setup
1. Create a Supabase project.
2. Run `supabase/schema.sql` in Supabase SQL Editor.
3. In Supabase **Connect**, copy Project URL + Publishable key.
4. Copy `.env.example` to `.env.local` and fill the values.
5. Run `npm install` then `npm run dev`.
6. In Supabase Authentication → URL Configuration set:
   - Site URL: `http://localhost:3000`
   - Redirect URL: `http://localhost:3000/auth/callback`
7. Sign up your own account and confirm the email.
8. In SQL Editor run:
   `update public.profiles set approved=true,is_admin=true where email='YOUR_EMAIL_HERE';`
9. Refresh. You should see `/admin`.
10. Push this folder to GitHub.
11. Import the repo into Vercel.
12. Add these Vercel Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `NEXT_PUBLIC_SITE_URL`
13. After Vercel gives you a URL, set `NEXT_PUBLIC_SITE_URL` to it and redeploy.
14. In Supabase Authentication → URL Configuration add your Vercel URL and `/auth/callback`.

## Approval flow
- New user signs up.
- User confirms email.
- User sees Pending.
- Admin opens `/admin` and clicks Approve.
- Approved user can open `/map`.
- Remove access from `/admin` to block them again.
- An already-open map checks approval about every 30 seconds.

## Security
- Do not put a Supabase secret/service-role key in `NEXT_PUBLIC_...`.
- The map HTML is server-side and is only returned after approval.
- Supabase RLS protects the approval table.
- `/map` sends no-store/security headers.
- Keep email confirmation enabled.
- Before production deploys, run `npm update` and `npm audit`.
- Next.js announced an Aug 26, 2026 security release; update Next.js immediately when that patch is available.


# Admin GPX Route Manager

This upgraded project lets the administrator add or replace map routes without editing code.

## One-time database upgrade

If you already ran the old `supabase/schema.sql`, open Supabase SQL Editor again and run the NEW `supabase/schema.sql`.
The `create table if not exists` statements are safe to run again.

## Uploading a route

1. Sign in with the administrator account.
2. Open `/admin`.
3. Scroll to **Upload GPX route**.
4. Enter the exact route name you want users to see.
5. Enter an order number.
6. Choose the `.gpx` file.
7. Press **Upload route**.

The route is parsed on the server and saved to the `routes` table.
It appears on the map without editing `index.html` and without redeploying Vercel.

The map refreshes the backend route list when it opens and approximately every 60 seconds.

## Replacing an existing route

Upload a new GPX using the SAME route name.
The backend copy is updated.

Backend routes override built-in routes when names match.

## Suggested route order numbers

10 = Charlie 1 Downtown Eastside
20 = Charlie 2 Downtown Westside
30 = Romio 1 CityPark
40 = Romio 2 Caswell Hill
50 = Romio 3 University
60 = Victor 1 + Broadway 1


# IMPORTANT — Route delete fix

This version removes the old hard-coded GPX routes from the map.

From now on, every managed route shown in the route selector comes from the
Supabase `routes` table. Therefore:

- Upload = adds a route
- Upload same name = updates/replaces that route
- Delete route = removes it completely
- Changing `sort_order` controls route order
- No Vercel redeploy is needed for normal GPX route changes

After deploying this version, upload any route you still want from `/admin`.
Any old hard-coded route that was never uploaded to Supabase will no longer show.

## Manual fire hydrants

Admins can add missing hydrants by tapping a small map in the Admin panel. These are stored separately from the City of Saskatoon ArcGIS layer and displayed together on the protected map.

Before using this feature, run `supabase/manual-hydrants.sql` once in Supabase SQL Editor. This creates the `manual_hydrants` table and admin-only write policies.


## Private driven routes
Run `supabase/driven-routes.sql` once in Supabase SQL Editor.
- Drive/Route Drive records the actual GPS path. After stopping, the user can save it privately to their own account.
- Saved private drives appear in the route selector with a lock icon and can be deleted by that user only.
- Voice navigation and destination/address navigation are intentionally not included.

## City-wide hydrant loading
The Hydrants button now retrieves the complete public City of Saskatoon hydrant layer through the protected `/api/hydrants` endpoint. The endpoint first obtains all ArcGIS object IDs and then downloads features in batches, which avoids silently missing hydrants because of ArcGIS record limits or the user's current viewport. Admin-added hydrants are merged into the result for display.


## Community hydrant verification
Run `supabase/hydrant-verification.sql` once in Supabase SQL Editor.

- Admin can add an **unverified hydrant candidate** from the Admin hydrant map.
- Pending candidates appear as **orange** points for approved users.
- When an approved user is within about 30 m and is not moving at driving speed, the map can ask them to confirm the candidate. Users can also tap the orange point themselves.
- **YES** promotes that candidate into `manual_hydrants` permanently. The candidate stops asking everyone else immediately.
- **NO** hides the candidate only for that user; another approved user can still verify it later.
- This is intended for candidate points placed from reliable clues or field knowledge. The City standard-location drawing is a design standard and does not contain exact city-wide hydrant coordinates, so the app does not invent hydrant points from that drawing alone.


## Hydrant reliability fix
City hydrants are fetched server-side with form-encoded POST batches to avoid URL-length/proxy failures. If you previously ran `hydrant-verification.sql`, run the updated version once more so globally rejected candidates are supported.
