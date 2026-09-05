import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  approveUser,
  revokeUser,
  blockUser,
  unblockUser,
  uploadRoute,
  deleteRoute,
  addHydrant,
  deleteHydrant,
  addHydrantCandidate,
  deleteHydrantCandidate,
} from './actions'
import HydrantPicker from './hydrant-picker'

export const dynamic = 'force-dynamic'

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: me } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!me?.is_admin) {
    redirect('/pending')
  }

  const { data: users } = await supabase
    .from('profiles')
    .select('id,email,full_name,approved,is_admin,blocked,created_at')
    .order('created_at', { ascending: false })

  const { data: routes } = await supabase
    .from('routes')
    .select('id,name,sort_order,updated_at')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  const { data: manualHydrants } = await supabase
    .from('manual_hydrants')
    .select('id,latitude,longitude,address,note,created_at')
    .order('created_at', { ascending: false })

  const { data: hydrantCandidates } = await supabase
    .from('hydrant_candidates')
    .select('id,latitude,longitude,address,note,status,created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  return (
    <main className="shell" style={{ width: 'min(94vw, 820px)' }}>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <h1>Admin</h1>
            <p className="muted">Manage users, access, GPX routes, and missing fire hydrants.</p>
          </div>

          <div className="row">
            <a className="button secondary" href="/map">Open map</a>
            <a className="button secondary" href="/logout">Sign out</a>
          </div>
        </div>

        {params.message ? (
          <div className="message" style={{ marginBottom: 16 }}>
            {params.message}
          </div>
        ) : null}

        <hr style={{ border: 0, borderTop: '1px solid #e6e9ed', margin: '22px 0' }} />

        <h2>Upload GPX route</h2>
        <p className="muted">
          Upload a complete .gpx file here. No code change or Vercel redeploy is needed.
          If you upload the same route name again, it replaces the previous backend copy.
        </p>

        <form action={uploadRoute}>
          <div>
            <label htmlFor="routeName">Route name</label>
            <input
              id="routeName"
              name="routeName"
              placeholder="Example: Romio 2 Caswell Hill"
            />
          </div>

          <div>
            <label htmlFor="sortOrder">Order number</label>
            <input
              id="sortOrder"
              name="sortOrder"
              type="number"
              defaultValue="100"
            />
            <div className="muted">
              Smaller numbers appear first in the route list.
            </div>
          </div>

          <div>
            <label htmlFor="gpxFile">GPX file</label>
            <input
              id="gpxFile"
              name="gpxFile"
              type="file"
              accept=".gpx,application/gpx+xml,application/xml,text/xml"
              required
            />
          </div>

          <button type="submit">Upload route</button>
        </form>

        <h2 style={{ marginTop: 28 }}>Backend routes</h2>

        {(routes || []).length === 0 ? (
          <p className="muted">No backend routes uploaded yet.</p>
        ) : (
          (routes || []).map((route) => (
            <div className="user" key={route.id}>
              <strong>{route.name}</strong>
              <div className="muted">
                Order {route.sort_order} • Updated {new Date(route.updated_at).toLocaleString()}
              </div>

              <form action={deleteRoute} style={{ marginTop: 8 }}>
                <input type="hidden" name="routeId" value={route.id} />
                <button className="danger" type="submit">
                  Delete route
                </button>
              </form>
            </div>
          ))
        )}

        <hr style={{ border: 0, borderTop: '1px solid #e6e9ed', margin: '28px 0' }} />

        <h2>Fire Hydrant Manager</h2>
        <p className="muted">
          Use a permanent hydrant only when you already know it exists. If you are using the City standard-location drawing or another clue but still need field confirmation, add it as an unverified candidate instead.
        </p>

        <details open>
          <summary style={{ cursor: 'pointer', fontWeight: 700, marginBottom: 12 }}>
            🟠 Add unverified candidate for users to confirm
          </summary>
          <form action={addHydrantCandidate}>
            <HydrantPicker idPrefix="candidate" />
            <button type="submit">🟠 Add candidate hydrant</button>
          </form>
        </details>

        <h2 style={{ marginTop: 28 }}>Pending hydrant candidates</h2>
        <p className="muted">
          Candidates show as orange markers. When one approved user confirms YES, it becomes a permanent hydrant. If one approved user says NO, the candidate is rejected and removed from every user's map. Nobody else will be asked about it.
        </p>
        {(hydrantCandidates || []).length === 0 ? (
          <p className="muted">No pending hydrant candidates.</p>
        ) : (
          (hydrantCandidates || []).map((candidate) => (
            <div className="user" key={candidate.id}>
              <strong>{candidate.address || 'Unverified hydrant candidate'}</strong>
              <div className="muted">
                {Number(candidate.latitude).toFixed(6)}, {Number(candidate.longitude).toFixed(6)}
              </div>
              {candidate.note ? <div className="muted" style={{ marginTop: 4 }}>{candidate.note}</div> : null}
              <form action={deleteHydrantCandidate} style={{ marginTop: 8 }}>
                <input type="hidden" name="candidateId" value={candidate.id} />
                <button className="danger" type="submit">Delete candidate</button>
              </form>
            </div>
          ))
        )}

        <details style={{ marginTop: 28 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 700, marginBottom: 12 }}>
            🔥 Add already-confirmed permanent hydrant
          </summary>
          <form action={addHydrant}>
            <HydrantPicker idPrefix="permanent" />
            <button type="submit">🔥 Add permanent hydrant</button>
          </form>
        </details>

        <h2 style={{ marginTop: 28 }}>Permanent manually added hydrants</h2>
        {(manualHydrants || []).length === 0 ? (
          <p className="muted">No manually added hydrants yet.</p>
        ) : (
          (manualHydrants || []).map((hydrant) => (
            <div className="user" key={hydrant.id}>
              <strong>{hydrant.address || 'Manual fire hydrant'}</strong>
              <div className="muted">
                {Number(hydrant.latitude).toFixed(6)}, {Number(hydrant.longitude).toFixed(6)}
              </div>
              {hydrant.note ? <div className="muted" style={{ marginTop: 4 }}>{hydrant.note}</div> : null}
              <form action={deleteHydrant} style={{ marginTop: 8 }}>
                <input type="hidden" name="hydrantId" value={hydrant.id} />
                <button className="danger" type="submit">Delete hydrant</button>
              </form>
            </div>
          ))
        )}

        <hr style={{ border: 0, borderTop: '1px solid #e6e9ed', margin: '28px 0' }} />

        <h2>User approvals</h2>

        {(users || []).map((profile) => (
          <div className="user" key={profile.id}>
            <strong>{profile.full_name || 'No name'}</strong>
            <div className="muted">{profile.email}</div>

            <div className="row" style={{ marginTop: 8 }}>
              {profile.is_admin ? (
                <span className="badge approved">Admin</span>
              ) : profile.blocked ? (
                <span className="badge blocked">Blocked</span>
              ) : profile.approved ? (
                <span className="badge approved">Approved</span>
              ) : (
                <span className="badge pending">Pending</span>
              )}

              {!profile.is_admin && profile.blocked ? (
                <form action={unblockUser}>
                  <input type="hidden" name="id" value={profile.id} />
                  <button type="submit">Unblock</button>
                </form>
              ) : null}

              {!profile.is_admin && !profile.blocked && !profile.approved ? (
                <form action={approveUser}>
                  <input type="hidden" name="id" value={profile.id} />
                  <button type="submit">Approve</button>
                </form>
              ) : null}

              {!profile.is_admin && !profile.blocked && profile.approved ? (
                <form action={revokeUser}>
                  <input type="hidden" name="id" value={profile.id} />
                  <button className="secondary" type="submit">Remove access</button>
                </form>
              ) : null}

              {!profile.is_admin && !profile.blocked ? (
                <form action={blockUser}>
                  <input type="hidden" name="id" value={profile.id} />
                  <button className="danger" type="submit">Block / Deny access</button>
                </form>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
