const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ctraubzxdycwtzzpnhen.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const ADMIN_ROLES = ['super_admin', 'state_admin']
const TABLES = [
  'states', 'districts', 'blocks', 'gram_panchayats', 'villages',
  'users', 'marketing_executives', 'sales_targets',
  'product_categories', 'products', 'inventory', 'customers',
  'orders', 'order_items', 'invoices', 'invoice_items', 'payments',
]
// Writes to these tables are limited to super/state admins
const ADMIN_WRITE_TABLES = ['states', 'districts', 'blocks', 'gram_panchayats', 'villages', 'users', 'marketing_executives', 'sales_targets']

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  }
  const reply = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) })
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' }
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method not allowed' })
  if (!SERVICE_KEY) return reply(500, { error: 'SUPABASE_SERVICE_ROLE_KEY not set. Add it in Netlify → Site Settings → Environment Variables.' })

  let body
  try { body = JSON.parse(event.body || '{}') } catch { return reply(400, { error: 'Invalid JSON' }) }

  const sbHeaders = {
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  }

  // ── Verify the caller's Supabase session and load their profile ──
  const authHeader = event.headers.authorization || event.headers.Authorization || ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) return reply(401, { error: 'Not logged in' })
  const meRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}` } })
  if (!meRes.ok) return reply(401, { error: 'Session expired. Please log in again.' })
  const me = await meRes.json()
  const profRes = await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${me.id}&select=id,role,is_active`, { headers: sbHeaders })
  const caller = (await profRes.json())?.[0]
  if (!caller || !caller.is_active) return reply(403, { error: 'Account inactive or not found' })
  const isAdmin = ADMIN_ROLES.includes(caller.role)

  const { action, table, id, data } = body
  const writes = ['insert', 'update', 'delete', 'delete_where']
  if (table && !TABLES.includes(table)) return reply(400, { error: `Unknown table: ${table}` })
  // Portal users are only changed through the user actions below
  if (writes.includes(action) && table === 'users') return reply(403, { error: 'Use the user management actions' })
  if (writes.includes(action) && ADMIN_WRITE_TABLES.includes(table) && !isAdmin) return reply(403, { error: 'Only admins can change this data' })
  const USER_ACTIONS = ['create_user', 'update_user', 'reset_password', 'delete_user', 'upload_photo']
  if (USER_ACTIONS.includes(action) && !isAdmin) return reply(403, { error: 'Only admins can manage users' })
  // A state admin may only manage non-admin users
  if (caller.role === 'state_admin' && ['create_user', 'update_user'].includes(action) && ADMIN_ROLES.includes(data?.role)) {
    return reply(403, { error: 'State admin cannot create or promote admin users' })
  }
  const enc = v => encodeURIComponent(v ?? '')
  const loadTarget = async (userId) => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${enc(userId)}&select=id,role`, { headers: sbHeaders })
    return (await r.json())?.[0]
  }
  if (['update_user', 'reset_password', 'delete_user'].includes(action)) {
    const target = await loadTarget(id)
    if (!target) return reply(404, { error: 'User not found' })
    if (caller.role === 'state_admin' && ADMIN_ROLES.includes(target.role)) return reply(403, { error: 'State admin cannot manage admin users' })
    if (id === caller.id && action !== 'reset_password' && (action === 'delete_user' || data?.is_active === false || (data?.role && data.role !== caller.role))) {
      return reply(400, { error: 'You cannot delete, deactivate or change the role of your own account' })
    }
  }

  try {
    let res, json
    if (action === 'create_user') {
      const { email, password, first_name, last_name, phone, role, state_id, district_id, block_id } = data || {}
      if (!email || !password || !first_name) return reply(400, { error: 'Name, email and password are required' })
      if (password.length < 6) return reply(400, { error: 'Password must be at least 6 characters' })

      const authRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: sbHeaders,
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          email_confirm: true,
          user_metadata: { first_name, last_name: last_name || '', phone: phone || '', role: role || 'marketing_executive' },
        }),
      })
      const authText = await authRes.text()
      const authJson = authText ? JSON.parse(authText) : {}
      if (!authRes.ok) {
        return reply(authRes.status, { error: authJson.msg || authJson.message || authJson.error_description || 'Auth user creation failed' })
      }

      const authUser = authJson.user || authJson
      const profile = {
        id: authUser.id,
        email: email.trim().toLowerCase(),
        first_name,
        last_name: last_name || null,
        phone: phone || null,
        role: role || 'marketing_executive',
        state_id: state_id || null,
        district_id: district_id || null,
        block_id: block_id || null,
        is_active: true,
        is_verified: true,
      }
      const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/users?on_conflict=id`, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(profile),
      })
      const profileText = await profileRes.text()
      const profileJson = profileText ? JSON.parse(profileText) : []
      if (!profileRes.ok) {
        await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${authUser.id}`, { method: 'DELETE', headers: sbHeaders })
        return reply(profileRes.status, { error: profileJson.message || 'User profile creation failed' })
      }
      json = { user: Array.isArray(profileJson) ? profileJson[0] : profileJson }
    } else if (action === 'save_order') {
      // Order + items saved in one DB transaction; stock is adjusted by triggers
      const { order, items } = data || {}
      res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/save_order`, {
        method: 'POST',
        headers: sbHeaders,
        body: JSON.stringify({ p_id: id || null, p_order: { ...order, ...(id ? {} : { created_by: caller.id }) }, p_items: items || [] }),
      })
      const text = await res.text()
      json = text ? JSON.parse(text) : null
      if (!res.ok) return reply(400, { error: String(json?.message || 'Order save failed').replace(/^STOCK_SHORT: /, '') })
      json = { id: json }
    } else if (action === 'update_user') {
      const allowed = ['first_name', 'last_name', 'phone', 'role', 'state_id', 'district_id', 'block_id', 'is_active']
      const patch = Object.fromEntries(Object.entries(data || {})
        .filter(([k]) => allowed.includes(k))
        .map(([k, v]) => [k, k.endsWith('_id') && !v ? null : v]))
      if ('first_name' in patch && !String(patch.first_name || '').trim()) return reply(400, { error: 'First name is required' })
      res = await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${enc(id)}`, { method: 'PATCH', headers: sbHeaders, body: JSON.stringify(patch) })
      const text = await res.text()
      json = text ? JSON.parse(text) : {}
      if (!res.ok) return reply(res.status, { error: json.message || 'User update failed' })
      json = { user: Array.isArray(json) ? json[0] : json }
    } else if (action === 'reset_password') {
      const password = data?.password || ''
      if (password.length < 6) return reply(400, { error: 'Password must be at least 6 characters' })
      res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${enc(id)}`, { method: 'PUT', headers: sbHeaders, body: JSON.stringify({ password }) })
      json = await res.json()
      if (!res.ok) return reply(res.status, { error: json.msg || json.message || 'Password reset failed' })
      json = { success: true }
    } else if (action === 'delete_user') {
      // Deleting the auth user cascades to public.users and its profile rows
      res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${enc(id)}`, { method: 'DELETE', headers: sbHeaders })
      json = res.ok ? { success: true } : await res.json()
      if (!res.ok) return reply(res.status, { error: json.msg || json.message || 'User delete failed' })
    } else if (action === 'delete') {
      res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${enc(id)}`, { method: 'DELETE', headers: sbHeaders })
      json = res.ok ? { success: true } : await res.json()
    } else if (action === 'update') {
      res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${enc(id)}`, { method: 'PATCH', headers: sbHeaders, body: JSON.stringify(data) })
      const text = await res.text()
      json = text ? JSON.parse(text) : { success: true }
    } else if (action === 'insert') {
      res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, { method: 'POST', headers: sbHeaders, body: JSON.stringify(data) })
      const text = await res.text()
      json = text ? JSON.parse(text) : { success: true }
    } else if (action === 'delete_where') {
      const { field, value } = body
      if (!/^[a-z_]+$/.test(field || '')) return reply(400, { error: 'Invalid field' })
      res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${field}=eq.${enc(value)}`, { method: 'DELETE', headers: sbHeaders })
      json = res.ok ? { success: true } : await res.json()
    } else if (action === 'select') {
      const qs = (data && data.qs) ? data.qs : ''
      res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${qs}`, { method: 'GET', headers: sbHeaders })
      const text = await res.text()
      json = text ? JSON.parse(text) : []
    } else if (action === 'upload_photo') {
      const { filename, contentType, base64data } = data || {}
      const bucket = 'executive-photos'
      const safeName = String(filename || 'photo').replace(/[^a-zA-Z0-9._-]/g, '_')
      const buf = Buffer.from(base64data || '', 'base64')
      const upRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${safeName}`, {
        method: 'POST',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': contentType || 'image/jpeg', 'x-upsert': 'true' },
        body: buf,
      })
      const upText = await upRes.text()
      const upJson = upText ? JSON.parse(upText) : {}
      if (!upRes.ok) return reply(upRes.status, { error: upJson.message || 'Photo upload failed' })
      json = { url: `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${safeName}`, ...upJson }
    } else {
      return reply(400, { error: 'Unknown action' })
    }
    if (res && !res.ok) return reply(res.status, { error: json?.message || json?.error || 'Database request failed' })
    return reply(200, json)
  } catch (e) {
    return reply(500, { error: e.message })
  }
}
