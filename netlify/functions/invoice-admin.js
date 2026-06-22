const SUPABASE_URL = 'https://aqrczwhdvhxmvmquckid.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  }
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  if (!SERVICE_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: 'SUPABASE_SERVICE_ROLE_KEY not set. Add it in Netlify → Site Settings → Environment Variables.' }) }

  let body
  try { body = JSON.parse(event.body || '{}') } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) } }

  const { action, table, id, data } = body
  const sbHeaders = {
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  }

  try {
    let res, json
    if (action === 'delete') {
      res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, { method: 'DELETE', headers: sbHeaders })
      json = res.ok ? { success: true } : await res.json()
    } else if (action === 'update') {
      res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, { method: 'PATCH', headers: sbHeaders, body: JSON.stringify(data) })
      const text = await res.text()
      json = text ? JSON.parse(text) : { success: true }
    } else if (action === 'insert') {
      res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, { method: 'POST', headers: sbHeaders, body: JSON.stringify(data) })
      const text = await res.text()
      json = text ? JSON.parse(text) : { success: true }
    } else if (action === 'delete_where') {
      const { field, value } = body
      res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${field}=eq.${value}`, { method: 'DELETE', headers: sbHeaders })
      json = res.ok ? { success: true } : await res.json()
    } else if (action === 'list') {
      const { filter } = body
      const qs = filter ? Object.entries(filter).map(([k, v]) => `${k}=eq.${v}`).join('&') : ''
      const listHeaders = { ...sbHeaders, 'Prefer': 'return=representation' }
      res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${qs}&order=created_at.desc`, { method: 'GET', headers: listHeaders })
      const text = await res.text()
      json = text ? JSON.parse(text) : []
    } else if (action === 'select') {
      const qs = (data && data.qs) ? data.qs : ''
      res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${qs}`, { method: 'GET', headers: sbHeaders })
      const text = await res.text()
      json = text ? JSON.parse(text) : []
    } else if (action === 'upload_photo') {
      const { filename, contentType, base64data } = data
      const bucket = 'executive-photos'
      await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
        method: 'POST',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: bucket, name: bucket, public: true })
      })
      const buf = Buffer.from(base64data, 'base64')
      const upRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${filename}`, {
        method: 'POST',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': contentType || 'image/jpeg', 'x-upsert': 'true' },
        body: buf
      })
      const upText = await upRes.text()
      const upJson = upText ? JSON.parse(upText) : {}
      json = { url: `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${filename}`, ...upJson }
    } else {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown action' }) }
    }
    return { statusCode: 200, headers, body: JSON.stringify(json) }
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) }
  }
}
