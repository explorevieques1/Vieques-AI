// Client for the owner-only /api/admin/* routes (backend/admin.js).
// The backend's ADMIN_USER_IDS check is the real gate; nothing here grants access.
import { getSession } from './supabase.js'

// Always the LOCAL backend — deliberately not VITE_API_BASE. The admin routes
// are never mounted on the production API (backend/admin.js), so a landing .env
// pointing at Railway would make every admin call 404. Override with
// VITE_ADMIN_API_BASE only if your local backend runs on another port.
const API_BASE = import.meta.env.VITE_ADMIN_API_BASE || 'http://localhost:3001'

export class AdminError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

async function call(method, path, body) {
  const { data } = await getSession()
  const token = data.session?.access_token
  if (!token) throw new AdminError('Not signed in', 401)
  const res = await fetch(`${API_BASE}/api/admin${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new AdminError(json.error || `Request failed (${res.status})`, res.status)
  return json
}

export const adminConfig = () => call('GET', '/config')
export const adminList = (kind) => call('GET', `/${kind}`)
export const adminCreate = (kind, values) => call('POST', `/${kind}`, values)
export const adminUpdate = (kind, id, values) => call('PATCH', `/${kind}/${id}`, values)

// Raw file body (not base64): phone photos are several MB. macOS sometimes
// reports HEIC files with an empty type, so infer it from the extension.
export async function adminUploadPhoto(kind, id, file) {
  const { data } = await getSession()
  const token = data.session?.access_token
  if (!token) throw new AdminError('Not signed in', 401)
  const type = file.type || (/\.hei[cf]$/i.test(file.name) ? 'image/heic' : 'application/octet-stream')
  const res = await fetch(`${API_BASE}/api/admin/${kind}/${id}/photo`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': type },
    body: file,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new AdminError(json.error || `Upload failed (${res.status})`, res.status)
  return json
}
