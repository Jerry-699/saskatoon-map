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
              placeholder=""
            />
          </div>

          <div>
            <label htmlFor="sortOrder">Order number</label>
            <input
              id="sortOrder"
              name="sortOrder"
              type="number"
              defaultValue="1"
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
          Add a hydrant only when it is missing from the City hydrant layer. Your manual hydrants are stored separately, so City data is never changed.
        </p>

        <form action={addHydrant}>
          <HydrantPicker />
          <button type="submit">🔥 Add fire hydrant</button>
        </form>

        <h2 style={{ marginTop: 28 }}>Manually added hydrants</h2>
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
