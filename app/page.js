'use client'
import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { supabase } from './lib/supabase'
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

// ─── API CONFIG ───────────────────────────────────────────────
const API = 'https://69f6e61bd9bdaee24ae46336--soilappnet.netlify.app'
const LOCAL_ADMIN_EMAIL = process.env.NEXT_PUBLIC_LOCAL_ADMIN_EMAIL || 'admin@soil.com'
const LOCAL_ADMIN_PASSWORD = process.env.NEXT_PUBLIC_LOCAL_ADMIN_PASSWORD || 'Soil@123'
const isLocalhost = () => typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)

const apiFetch = async (path, opts = {}) => {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) }
  const res = await fetch(`${API}/api/${path}`, { ...opts, headers })
  const text = await res.text()
  try { return JSON.parse(text) } catch { return text }
}

const adminFetch = async (action, table, id, data = null, field = null, value = null) => {
  const res = await fetch('/.netlify/functions/invoice-admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, table, id, data, field, value }),
  })
  return res.json()
}

// ─── UTILS ────────────────────────────────────────────────────
const cur = n => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })
const fmtDate = s => s ? new Date(s).toLocaleDateString('en-IN') : '-'
const _ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen']
const _tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety']
function _tw(n) {
  if (n === 0) return ''
  if (n < 20) return _ones[n]
  if (n < 100) return _tens[Math.floor(n/10)] + (n%10 ? ' '+_ones[n%10] : '')
  if (n < 1000) return _ones[Math.floor(n/100)] + ' Hundred' + (n%100 ? ' '+_tw(n%100) : '')
  if (n < 100000) return _tw(Math.floor(n/1000)) + ' Thousand' + (n%1000 ? ' '+_tw(n%1000) : '')
  if (n < 10000000) return _tw(Math.floor(n/100000)) + ' Lakh' + (n%100000 ? ' '+_tw(n%100000) : '')
  return _tw(Math.floor(n/10000000)) + ' Crore' + (n%10000000 ? ' '+_tw(n%10000000) : '')
}
const amtInWords = n => { const r = Math.round(Math.abs(n||0)*100)/100; const [i,d] = r.toFixed(2).split('.'); const w = _tw(parseInt(i)) || 'Zero'; return w + (parseInt(d)>0 ? ' and '+_tw(parseInt(d))+' Paise' : '') + ' Only' }
const LS = {
  get: (k, d = null) => { try { return JSON.parse(localStorage.getItem(k) ?? 'null') ?? d } catch { return d } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} },
}
const DEFAULT_COMPANY = { address: 'Lakhnaur, Muzaffarpur, Bihar - 843302', gstin: '10AAUCS2823Q1ZA', phone: '+91-9876543210', email: 'info@soilorganic.com', website: 'www.soilorganic.com' }
const getCompany = () => { try { return { ...DEFAULT_COMPANY, ...JSON.parse(localStorage.getItem('soil_company') || '{}') } } catch { return DEFAULT_COMPANY } }
const saveCompany = d => localStorage.setItem('soil_company', JSON.stringify(d))

// ─── ROLES ────────────────────────────────────────────────────
const MODULES = {
  super_admin: ['dashboard','products','customers','orders','invoices','payments','inventory','reports','executives','locations','activity'],
  state_admin: ['dashboard','products','customers','orders','invoices','payments','inventory','reports','executives','locations','activity'],
  district_admin: ['dashboard','products','customers','orders','invoices','payments','inventory','reports'],
  block_admin: ['dashboard','products','customers','orders'],
  marketing_executive: ['dashboard','customers','orders'],
  accountant: ['dashboard','invoices','payments','reports'],
}
const ROLE_LABEL = {
  super_admin: 'Super Admin', state_admin: 'State Admin', district_admin: 'District Admin',
  block_admin: 'Block Admin', marketing_executive: 'Marketing Executive', accountant: 'Accountant',
}
const can = (user, mod) => (MODULES[user?.role] || []).includes(mod)

// ─── STATUS BADGE ────────────────────────────────────────────
const STATUS_COLORS = {
  pending:'bg-yellow-100 text-yellow-700', confirmed:'bg-blue-100 text-blue-700',
  dispatched:'bg-purple-100 text-purple-700', delivered:'bg-green-100 text-green-700',
  cancelled:'bg-red-100 text-red-700', paid:'bg-green-100 text-green-700',
  pending:'bg-red-100 text-red-700', unpaid:'bg-red-100 text-red-700', partial:'bg-orange-100 text-orange-700',
  active:'bg-green-100 text-green-700', inactive:'bg-gray-100 text-gray-600',
}
function Badge({ s }) {
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_COLORS[s] || 'bg-gray-100 text-gray-600'}`}>{s}</span>
}
function Btns({ onEdit, onDel }) {
  return <div className="flex gap-1">
    <button onClick={onEdit} className="px-2.5 py-1 text-xs bg-amber-50 text-amber-600 rounded-lg hover:bg-amber-100 font-medium border border-amber-100">Edit</button>
    <button onClick={onDel} className="px-2.5 py-1 text-xs bg-red-50 text-red-600 rounded-lg hover:bg-red-100 font-medium border border-red-100">Delete</button>
  </div>
}
function FRow({ label, children, required }) {
  return <div><label className="block text-xs font-medium text-gray-600 mb-1">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>{children}</div>
}
const inp = "w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
const sel = "w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
const CHART_COLORS = ['#16a34a','#2563eb','#d97706','#dc2626','#7c3aed']

// ─── MAIN APP ─────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authMode, setAuthMode] = useState('login')
  const [tab, setTab] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [searchQ, setSearchQ] = useState('')
  const [searchRes, setSearchRes] = useState([])

  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [customers, setCustomers] = useState([])
  const [orders, setOrders] = useState([])
  const [invoices, setInvoices] = useState([])
  const [payments, setPayments] = useState([])
  const [inventory, setInventory] = useState([])
  const [states, setStates] = useState([])
  const [districts, setDistricts] = useState([])
  const [blocks, setBlocks] = useState([])
  const [villages, setVillages] = useState([])
  const [panchayats, setPanchayats] = useState([])
  const [executives, setExecutives] = useState([])
  const [portalUsers, setPortalUsers] = useState([])

  const [modal, setModal] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [orderFilter, setOrderFilter] = useState('all')
  const [invFilter, setInvFilter] = useState('all')
  const [reportPeriod, setReportPeriod] = useState(30)
  const [invTab, setInvTab] = useState('stock')
  const [oItems, setOItems] = useState([])

  const loadAll = useCallback(async () => {
    try {
      const [p, cat, cust, ord, inv, pay, invnt, st, dist, bl, vil, panch, pu] = await Promise.all([
        apiFetch('products'), apiFetch('categories'), apiFetch('customers'),
        apiFetch('orders'), adminFetch('list', 'invoices'), apiFetch('payments'),
        apiFetch('inventory'), apiFetch('states'), apiFetch('districts'),
        apiFetch('blocks'), apiFetch('villages'), apiFetch('gram_panchayats'),
        adminFetch('select', 'users', null, { qs: 'select=*,states(name),districts(name),blocks(name)&order=created_at.desc' }),
      ])
      setProducts(Array.isArray(p) ? p : [])
      setCategories(Array.isArray(cat) ? cat : [])
      setCustomers(Array.isArray(cust) ? cust : [])
      setOrders(Array.isArray(ord) ? ord : [])
      setInvoices(Array.isArray(inv) ? inv : [])
      setPayments(Array.isArray(pay) ? pay : [])
      setInventory(Array.isArray(invnt) ? invnt : [])
      setStates(Array.isArray(st) ? st : [])
      setDistricts(Array.isArray(dist) ? dist : [])
      setBlocks(Array.isArray(bl) ? bl : [])
      setVillages(Array.isArray(vil) ? vil : [])
      setPanchayats(Array.isArray(panch) ? panch : [])
      setPortalUsers(Array.isArray(pu) ? pu : [])
    } catch (e) { console.error('Load error:', e) }
  }, [])

  useEffect(() => {
    const u = LS.get('soil_user')
    if (u) setUser(u)
    setLoading(false)
    loadAll()
  }, [])

  useEffect(() => {
    if (searchQ.length < 2) { setSearchRes([]); return }
    const q = searchQ.toLowerCase()
    setSearchRes([
      ...products.filter(p => p.is_active !== false && (p.name.toLowerCase().includes(q) || p.product_code?.toLowerCase().includes(q))).slice(0, 3).map(p => ({ ...p, _t: 'products' })),
      ...customers.filter(c => c.name.toLowerCase().includes(q) || c.customer_code?.toLowerCase().includes(q)).slice(0, 3).map(c => ({ ...c, _t: 'customers' })),
      ...orders.filter(o => o.order_number?.toLowerCase().includes(q) || o.customer_name?.toLowerCase().includes(q)).slice(0, 3).map(o => ({ ...o, _t: 'orders' })),
    ])
  }, [searchQ, products, customers, orders])

  // ── AUTH ──
  const login = async (email, pass) => {
    setSaving(true)
    try {
      if (isLocalhost() && email.trim().toLowerCase() === LOCAL_ADMIN_EMAIL.toLowerCase() && pass === LOCAL_ADMIN_PASSWORD) {
        const localAdmin = {
          id: 'local-super-admin',
          first_name: 'Local',
          last_name: 'Admin',
          email: LOCAL_ADMIN_EMAIL,
          role: 'super_admin',
          is_active: true,
        }
        setUser(localAdmin); LS.set('soil_user', localAdmin); setTab('dashboard'); setErr(''); setSaving(false)
        return
      }
      const res = await apiFetch('auth/login', { method: 'POST', body: JSON.stringify({ email, password: pass }) })
      if (res?.user) {
        setUser(res.user); LS.set('soil_user', res.user); setTab('dashboard'); setErr('')
      } else { setErr(res?.message || res?.error || 'Invalid credentials') }
    } catch { setErr('Login failed. Please try again.') }
    setSaving(false)
  }

  const signup = async (d) => {
    setSaving(true)
    try {
      const res = await apiFetch('auth/signup', { method: 'POST', body: JSON.stringify(d) })
      if (res?.user || res?.id) {
        const u = res.user || res; setUser(u); LS.set('soil_user', u); setTab('dashboard'); setErr('')
      } else { setErr(res?.message || res?.error || 'Signup failed') }
    } catch { setErr('Signup failed') }
    setSaving(false)
  }

  const logout = () => { setUser(null); LS.set('soil_user', null) }

  const openModal = (type, data = null) => { setModal({ type, data }); setErr('') }
  const closeModal = () => { setModal(null); setErr(''); setSaving(false) }
  const askDel = (msg, fn) => setConfirm({ msg, fn })

  // ── PRODUCTS ──
  const saveProduct = async (d) => {
    setSaving(true)
    try {
      if (d.id) await apiFetch(`products/${d.id}`, { method: 'PUT', body: JSON.stringify(d) })
      else await apiFetch('products', { method: 'POST', body: JSON.stringify(d) })
      await loadAll(); closeModal()
    } catch (e) { setErr(e.message) }
    setSaving(false)
  }
  const delProduct = async (id) => {
    try { await apiFetch(`products/${id}`, { method: 'DELETE' }); await loadAll() } catch (e) { alert(e.message) }
  }

  // ── CATEGORIES ──
  const saveCat = async (d) => {
    try {
      if (d.id) await apiFetch(`categories/${d.id}`, { method: 'PUT', body: JSON.stringify(d) })
      else await apiFetch('categories', { method: 'POST', body: JSON.stringify(d) })
      const cats = await apiFetch('categories'); setCategories(Array.isArray(cats) ? cats : [])
    } catch (e) { setErr(e.message) }
  }
  const delCat = async (id) => {
    try { await apiFetch(`categories/${id}`, { method: 'DELETE' }); const cats = await apiFetch('categories'); setCategories(Array.isArray(cats) ? cats : []) } catch (e) { alert(e.message) }
  }

  // ── CUSTOMERS ──
  const saveCust = async (d) => {
    setSaving(true)
    try {
      if (d.id) await apiFetch(`customers/${d.id}`, { method: 'PUT', body: JSON.stringify(d) })
      else await apiFetch('customers', { method: 'POST', body: JSON.stringify(d) })
      await loadAll(); closeModal()
    } catch (e) { setErr(e.message) }
    setSaving(false)
  }
  const delCust = async (id) => {
    try { await apiFetch(`customers/${id}`, { method: 'DELETE' }); await loadAll() } catch (e) { alert(e.message) }
  }

  // ── ORDERS (EDIT + DELETE) ──
  const calcOrder = (items) => {
    const sub = items.reduce((s, i) => s + i.qty * i.rate, 0)
    const tax = items.reduce((s, i) => s + i.qty * i.rate * i.gst_rate / 100, 0)
    return { subtotal: sub, tax_amount: tax, total_amount: sub + tax }
  }
  const saveOrder = async (d) => {
    setSaving(true)
    try {
      const items = d.items || []
      const sub = items.reduce((s, i) => s + (i.qty || i.quantity || 0) * (i.rate || i.unit_rate || 0), 0)
      const tax = items.reduce((s, i) => s + (i.qty || i.quantity || 0) * (i.rate || i.unit_rate || 0) * (i.gst_rate || i.tax_rate || 0) / 100, 0)
      const orderPayload = {
        customer_id: d.customer_id,
        order_status: d.order_status || d.status || 'pending',
        order_date: d.order_date || new Date().toISOString().slice(0, 10),
        subtotal: sub, tax_amount: tax, total_amount: sub + tax,
        notes: d.notes || null,
        ...(d.id ? {} : { order_number: `ORD-${Date.now()}` }),
      }
      let orderId = d.id
      if (d.id) {
        await apiFetch(`orders/${d.id}`, { method: 'PUT', body: JSON.stringify(orderPayload) })
        // Remove old items then re-insert
        await adminFetch('delete_where', 'order_items', null, null, 'order_id', d.id)
      } else {
        const created = await apiFetch('orders', { method: 'POST', body: JSON.stringify(orderPayload) })
        if (created?.error) { setErr(created.error); setSaving(false); return }
        orderId = created.id
      }
      // Insert order items
      if (items.length > 0 && orderId) {
        const itemRows = items.map(i => ({
          order_id: orderId,
          product_id: i.product_id,
          quantity: i.qty || i.quantity || 1,
          unit_rate: i.rate || i.unit_rate || 0,
          tax_rate: i.gst_rate || i.tax_rate || 0,
          tax_amount: (i.qty || i.quantity || 0) * (i.rate || i.unit_rate || 0) * (i.gst_rate || i.tax_rate || 0) / 100,
          total_amount: (i.qty || i.quantity || 0) * (i.rate || i.unit_rate || 0),
        }))
        await adminFetch('insert', 'order_items', null, itemRows)
      }
      await loadAll(); setOItems([]); closeModal()
    } catch (e) { setErr(e.message) }
    setSaving(false)
  }
  const delOrder = async (id) => {
    try { await apiFetch(`orders/${id}`, { method: 'DELETE' }); await loadAll() } catch (e) { alert(e.message) }
  }

  const openEditOrder = async (o) => {
    const { data: dbItems } = await supabase
      .from('order_items')
      .select('*, products(name)')
      .eq('order_id', o.id)
    const mapped = (dbItems || []).map(i => ({
      product_id: i.product_id,
      product_name: i.products?.name || '',
      qty: i.quantity || 1,
      rate: i.unit_rate || 0,
      gst_rate: i.tax_rate || 0,
      amount: (i.quantity || 1) * (i.unit_rate || 0),
    }))
    setOItems(mapped)
    openModal('order', o)
  }

  // ── INVOICES (EDIT + DELETE) ──
  const saveInvoice = async (d) => {
    setSaving(true)
    try {
      const cgst = (d.subtotal || 0) * 0.09
      const { customer_name: _cn, ...rest } = d
      const payload = {
        ...rest,
        cgst_amount: cgst, sgst_amount: cgst, tax_amount: cgst * 2,
        total_amount: (d.subtotal || 0) + cgst * 2,
        order_id: rest.order_id || null,
        customer_id: rest.customer_id || null,
        state_id: rest.state_id || null,
        district_id: rest.district_id || null,
        block_id: rest.block_id || null,
      }
      const isErr = r => r && (r.error || r.message || r.code)
      const errMsg = r => r?.message || r?.error?.message || JSON.stringify(r)
      if (d.id) {
        const r = await adminFetch('update', 'invoices', d.id, payload)
        if (isErr(r)) { setErr('Update failed: ' + errMsg(r)); setSaving(false); return }
      } else {
        payload.invoice_number = `INV-${Date.now()}`
        const r = await adminFetch('insert', 'invoices', null, payload)
        if (isErr(r)) { setErr('Create failed: ' + errMsg(r)); setSaving(false); return }
      }
      await loadAll(); closeModal()
    } catch (e) { setErr(e.message) }
    setSaving(false)
  }
  const delInvoice = async (id) => {
    try {
      const r = await adminFetch('delete', 'invoices', id)
      if (r?.error) { alert('Delete failed: ' + r.error); return }
      await loadAll()
    } catch (e) { alert(e.message) }
  }

  const adjustInventory = async (invItem, adjQty, type) => {
    const newQty = type === 'in' ? (invItem.quantity || 0) + adjQty : Math.max(0, (invItem.quantity || 0) - adjQty)
    try {
      await apiFetch(`inventory/${invItem.id}`, { method: 'PATCH', body: JSON.stringify({ quantity: newQty }) })
      await loadAll(); closeModal()
    } catch (e) { alert(e.message) }
  }

  const printInvoice = async (id) => {
    const inv = await apiFetch(`invoices/${id}`)
    const cust = inv.customers || {}
    const items = inv.invoice_items || []
    const balance = (inv.total_amount||0)-(inv.paid_amount||0)
    const rows = items.map((it,i) => `<tr style="background:${i%2?'#f9fafb':'#fff'}">
      <td style="padding:6px 8px;color:#6b7280">${i+1}</td>
      <td style="padding:6px 8px;font-weight:500">${it.products?.name||'-'}<br><span style="font-size:10px;color:#9ca3af">${it.products?.product_code||''}</span></td>
      <td style="padding:6px 8px;color:#6b7280">${it.products?.hsn_code||it.hsn_code||'-'}</td>
      <td style="padding:6px 8px;text-align:center">${it.quantity} ${it.unit||''}</td>
      <td style="padding:6px 8px;text-align:right">${cur(it.rate)}</td>
      <td style="padding:6px 8px;text-align:center">${it.cgst_rate||9}%</td>
      <td style="padding:6px 8px;text-align:center">${it.sgst_rate||9}%</td>
      <td style="padding:6px 8px;text-align:right">${cur((it.quantity||0)*(it.rate||0)-(it.discount_amount||0))}</td>
      <td style="padding:6px 8px;text-align:right;font-weight:600">${cur(it.total_amount)}</td>
    </tr>`).join('')
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invoice ${inv.invoice_number}</title>
    <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:13px;color:#1f2937;padding:24px}
    @media print{body{padding:12px}}</style></head><body>
    <div style="border:2px solid #16a34a;border-radius:8px;overflow:hidden;max-width:900px;margin:0 auto">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:20px;border-bottom:2px solid #16a34a;background:#f0fdf4">
        <div style="display:flex;align-items:center;gap:12px">
          <img src="https://soilappnet.netlify.app/logo.png" alt="SOIL" style="height:70px;object-fit:contain;flex-shrink:0" />
          <div>
            <div style="font-size:11px;color:#6b7280;margin-top:4px">Lakhnaur, Muzaffarpur, Bihar - 843302</div>
            <div style="font-size:11px;color:#6b7280">GSTIN: 10AAUCS2823Q1ZA &nbsp;|&nbsp; Ph: +91-9876543210</div>
          </div></div>
        <div style="text-align:right">
          <div style="font-size:18px;font-weight:900;color:#15803d;border:2px solid #16a34a;padding:4px 14px;border-radius:6px;display:inline-block">TAX INVOICE</div>
          <div style="margin-top:8px;font-size:12px;color:#374151;line-height:1.6">
            <div><b>Invoice No:</b> ${inv.invoice_number}</div>
            <div><b>Date:</b> ${fmtDate(inv.invoice_date||inv.created_at)}</div>
            ${inv.due_date?`<div><b>Due Date:</b> ${fmtDate(inv.due_date)}</div>`:''}
          </div></div></div>
      <div style="padding:16px 20px;background:#f9fafb;border-bottom:1px solid #e5e7eb">
        <div style="font-size:10px;font-weight:700;color:#9ca3af;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:4px">BILL TO</div>
        <div style="font-weight:700;font-size:14px">${cust.name||inv.customer_name||'N/A'}</div>
        ${cust.address?`<div style="font-size:12px;color:#6b7280;margin-top:2px">${cust.address}</div>`:''}
        ${cust.gst_number?`<div style="font-size:12px;color:#6b7280">GSTIN: ${cust.gst_number}</div>`:''}
        ${cust.phone?`<div style="font-size:12px;color:#6b7280">Ph: ${cust.phone}</div>`:''}
      </div>
      ${items.length>0?`<div style="padding:16px 20px;border-bottom:1px solid #e5e7eb">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr style="background:#f0fdf4;color:#374151;font-weight:700">
            <th style="padding:8px;text-align:left">#</th>
            <th style="padding:8px;text-align:left">Product / Code</th>
            <th style="padding:8px;text-align:left">HSN</th>
            <th style="padding:8px;text-align:center">Qty</th>
            <th style="padding:8px;text-align:right">Rate</th>
            <th style="padding:8px;text-align:center">CGST%</th>
            <th style="padding:8px;text-align:center">SGST%</th>
            <th style="padding:8px;text-align:right">Taxable Amt</th>
            <th style="padding:8px;text-align:right">Total</th>
          </tr></thead><tbody>${rows}</tbody>
        </table></div>`:''}
      <div style="display:flex;gap:20px;padding:16px 20px;border-bottom:1px solid #e5e7eb">
        <div style="flex:1">
          ${inv.notes?`<div style="margin-bottom:12px"><b style="font-size:11px;color:#6b7280">Notes:</b><div style="background:#f3f4f6;padding:8px;border-radius:6px;font-size:12px;margin-top:4px">${inv.notes}</div></div>`:''}
          <div style="border:1px solid #e5e7eb;padding:10px;border-radius:6px;font-size:12px">
            <b style="color:#374151">Amount in Words:</b><br>
            <i style="color:#374151">${amtInWords(inv.total_amount||0)}</i>
          </div></div>
        <div style="width:220px;font-size:12px">
          <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #e5e7eb"><span style="color:#6b7280">Subtotal</span><span>${cur(inv.subtotal)}</span></div>
          ${(inv.discount_amount>0)?`<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #e5e7eb;color:#dc2626"><span>Discount</span><span>- ${cur(inv.discount_amount)}</span></div>`:''}
          <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #e5e7eb"><span style="color:#6b7280">CGST (9%)</span><span>${cur(inv.cgst_amount)}</span></div>
          <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #e5e7eb"><span style="color:#6b7280">SGST (9%)</span><span>${cur(inv.sgst_amount)}</span></div>
          ${(inv.igst_amount>0)?`<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #e5e7eb"><span style="color:#6b7280">IGST</span><span>${cur(inv.igst_amount)}</span></div>`:''}
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-top:2px solid #1f2937;font-weight:700;font-size:14px"><span>Grand Total</span><span style="color:#15803d">${cur(inv.total_amount)}</span></div>
          ${(inv.paid_amount>0)?`<div style="display:flex;justify-content:space-between;padding:4px 0;color:#16a34a"><span>Amount Paid</span><span>${cur(inv.paid_amount)}</span></div>`:''}
          ${(balance>0.5)?`<div style="display:flex;justify-content:space-between;padding:4px 0;font-weight:600;color:#dc2626"><span>Balance Due</span><span>${cur(balance)}</span></div>`:''}
        </div></div>
      <div style="display:flex;justify-content:space-between;align-items:flex-end;padding:16px 20px;background:#f9fafb;font-size:11px;color:#6b7280">
        <div><b style="color:#374151">Terms & Conditions:</b><br>
          • Goods once sold will not be taken back.<br>
          • Subject to Muzaffarpur jurisdiction. &nbsp; E. &amp; O.E.
        </div>
        <div style="text-align:right">
          <div style="font-weight:600;color:#374151">For Sheevar Organic Industrial Ltd.</div>
          <div style="margin-top:40px;border-top:1px solid #9ca3af;padding-top:4px">Authorized Signatory</div>
        </div></div></div>
    <script>window.onload=function(){window.print()}</script></body></html>`
    const w = window.open('','_blank','width=960,height=700')
    w.document.write(html)
    w.document.close()
  }

  // ── PORTAL USERS ──
  const saveAdminUser = async (d) => {
    setSaving(true)
    try {
      if (!d.first_name || !d.email || !d.password) { setErr('Name, email and password are required'); setSaving(false); return }
      // Step 1: Create auth user
      const created = await apiFetch('auth/signup', { method: 'POST', body: JSON.stringify({ first_name: d.first_name, last_name: d.last_name || '', email: d.email, phone: d.phone || '', password: d.password, role: d.role || 'marketing_executive' }) })
      const newUser = created?.user || created
      if (!newUser?.id) { setErr(newUser?.message || newUser?.error || 'User creation failed'); setSaving(false); return }
      const userId = newUser.id
      // Step 2: Set role + primary location on users table
      await adminFetch('update', 'users', userId, { role: d.role || 'marketing_executive', state_id: d.state_id || null, district_id: d.district_id || null, block_id: d.block_id || null })
      // Step 3: Upload photo if provided
      let photoUrl = null
      if (d.photoBase64 && d.photoFileName) {
        const upRes = await adminFetch('upload_photo', null, null, { filename: `${userId}_${d.photoFileName}`, contentType: d.photoContentType || 'image/jpeg', base64data: d.photoBase64 })
        photoUrl = upRes?.url || null
      }
      // Step 4: Store extended profile in sales_targets (incentive_slab JSONB)
      const profile = {
        address: d.address || null, aadhaar_no: d.aadhaar_no || null, pan_no: d.pan_no || null,
        emergency1: { name: d.emg1_name || '', relationship: d.emg1_rel || '' },
        emergency2: { name: d.emg2_name || '', relationship: d.emg2_rel || '' },
        panchayat_id: d.panchayat_id || null, village_id: d.village_id || null,
        employee_id: d.employee_id || null, joining_date: d.joining_date || null, photo_url: photoUrl,
      }
      await adminFetch('insert', 'sales_targets', null, { user_id: userId, period_month: 0, period_year: 0, target_amount: 0, achieved_amount: 0, status: 'executive_profile', notes: `Profile: ${d.first_name} ${d.last_name || ''}`, incentive_slab: profile })
      // Step 5: Insert into marketing_executives for working location
      if (d.state_id || d.district_id || d.block_id) {
        await adminFetch('insert', 'marketing_executives', null, { user_id: userId, state_id: d.state_id || null, district_id: d.district_id || null, block_id: d.block_id || null, employee_id: d.employee_id || null, joining_date: d.joining_date || null, target_amount: 0, is_active: true })
      }
      await loadAll(); closeModal()
    } catch (e) { setErr(e.message) }
    setSaving(false)
  }
  const deletePortalUser = async (id) => {
    try { await adminFetch('delete', 'users', id); await loadAll() } catch (e) { alert(e.message) }
  }

  // ── PAYMENTS ──
  const savePayment = async (d) => {
    setSaving(true)
    try {
      await apiFetch('payments', { method: 'POST', body: JSON.stringify(d) })
      await loadAll(); closeModal()
    } catch (e) { setErr(e.message) }
    setSaving(false)
  }

  // ── LOCATIONS ──
  const saveLocation = async (type, d) => {
    try {
      await apiFetch(type, { method: 'POST', body: JSON.stringify(d) })
      await loadAll(); closeModal()
    } catch (e) { setErr(e.message) }
  }

  // ─── AUTH SCREEN ─────────────────────────────────────────
  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="text-green-600 text-xl">Loading...</div></div>

  if (!user) return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="text-center mb-6">
          <div className="flex justify-center mb-2">
            <Image src="/logo.png" alt="SOIL - Sheevar Organic Industrial Limited" width={240} height={110} style={{objectFit:'contain'}} priority />
          </div>
          <span className="inline-block mt-1 text-xs bg-green-100 text-green-700 px-3 py-0.5 rounded-full font-medium">Distribution Management System</span>
        </div>
        <h2 className="text-lg font-semibold text-center mb-5 text-gray-700">{authMode === 'login' ? 'Sign In' : 'Create Account'}</h2>
        {err && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm">{err}</div>}
        {authMode === 'login' ? <AuthLogin onLogin={login} loading={saving} /> : <AuthSignup onSignup={signup} loading={saving} />}
        {authMode === 'login' && (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-xs text-green-800">
            <p className="font-semibold">Local admin login</p>
            <p>Email: {LOCAL_ADMIN_EMAIL}</p>
            <p>Password: {LOCAL_ADMIN_PASSWORD}</p>
          </div>
        )}
        <p className="text-center text-sm text-gray-500 mt-4">
          {authMode === 'login'
            ? <>No account? <button onClick={() => { setAuthMode('signup'); setErr('') }} className="text-green-600 font-semibold hover:underline">Sign Up</button></>
            : <>Have account? <button onClick={() => { setAuthMode('login'); setErr('') }} className="text-green-600 font-semibold hover:underline">Sign In</button></>}
        </p>
      </div>
    </div>
  )

  // ─── MAIN LAYOUT ─────────────────────────────────────────
  const navItems = [
    { k: 'dashboard', l: 'Dashboard', i: '📊' }, { k: 'products', l: 'Products', i: '📦' },
    { k: 'customers', l: 'Customers', i: '👥' }, { k: 'orders', l: 'Orders', i: '🛒' },
    { k: 'invoices', l: 'Invoices', i: '🧾' }, { k: 'payments', l: 'Payments', i: '💳' },
    { k: 'inventory', l: 'Inventory', i: '🏪' }, { k: 'reports', l: 'Reports', i: '📈' },
    { k: 'executives', l: 'Executives', i: '👔' }, { k: 'locations', l: 'Locations', i: '📍' },
  ].filter(n => can(user, n.k))

  const lowStock = inventory.filter(i => (i.quantity || 0) < (i.reorder_level || 10))

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* SIDEBAR */}
      <aside className={`${sidebarOpen ? 'w-60' : 'w-14'} flex-shrink-0 bg-gray-900 text-white flex flex-col transition-all duration-200`}>
        <div className={`flex items-center ${sidebarOpen ? 'justify-between px-4' : 'justify-center px-2'} py-4 border-b border-gray-700`}>
          {sidebarOpen && <div className="flex items-center gap-2"><Image src="/logo.png" alt="SOIL" width={80} height={36} style={{objectFit:'contain',filter:'brightness(1.1)'}} /></div>}
          <button onClick={() => setSidebarOpen(v => !v)} className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white text-xs">{sidebarOpen ? '◀' : '▶'}</button>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {navItems.map(n => (
            <button key={n.k} onClick={() => setTab(n.k)} className={`w-full flex items-center ${sidebarOpen ? 'gap-3 px-4' : 'justify-center px-2'} py-2.5 text-sm transition-colors ${tab === n.k ? 'bg-green-700 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
              <span>{n.i}</span>{sidebarOpen && <span>{n.l}</span>}
            </button>
          ))}
        </nav>
        <div className={`p-3 border-t border-gray-700 ${!sidebarOpen && 'flex justify-center'}`}>
          {sidebarOpen && <div className="mb-2"><p className="text-sm font-medium text-white truncate">{user.first_name} {user.last_name || ''}</p><p className="text-xs text-gray-400">{ROLE_LABEL[user.role] || user.role}</p></div>}
          <button onClick={logout} className="text-xs text-red-400 hover:text-red-300">{sidebarOpen ? '🚪 Logout' : '🚪'}</button>
        </div>
      </aside>

      {/* CONTENT */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b px-6 py-3 flex items-center justify-between gap-4">
          <h2 className="text-base font-semibold text-gray-800 capitalize">{tab.replace(/_/g, ' ')}</h2>
          <div className="relative">
            <input value={searchQ} onChange={e => setSearchQ(e.target.value)} onBlur={() => setTimeout(() => setSearchRes([]), 150)}
              placeholder="Search..." className="border rounded-lg px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-green-500" />
            {searchRes.length > 0 && (
              <div className="absolute right-0 top-full mt-1 w-72 bg-white border rounded-xl shadow-xl z-50">
                {searchRes.map(r => (
                  <button key={r.id} onMouseDown={() => { setTab(r._t); setSearchQ(''); setSearchRes([]) }} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 border-b last:border-0 flex items-center justify-between">
                    <span className="font-medium">{r.name || r.order_number}</span>
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{r._t.slice(0, -1)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-5">
          {tab === 'dashboard' && <RenderDashboard orders={orders} customers={customers} invoices={invoices} inventory={inventory} lowStock={lowStock} />}
          {tab === 'products' && <RenderProducts products={products} categories={categories} inventory={inventory} openModal={openModal} askDel={askDel} delProduct={delProduct} />}
          {tab === 'customers' && <RenderCustomers customers={customers} openModal={openModal} askDel={askDel} delCust={delCust} />}
          {tab === 'orders' && <RenderOrders orders={orders} customers={customers} products={products} filter={orderFilter} setFilter={setOrderFilter} openModal={openModal} askDel={askDel} delOrder={delOrder} setOItems={setOItems} openEditOrder={openEditOrder} />}
          {tab === 'invoices' && <RenderInvoices invoices={invoices} filter={invFilter} setFilter={setInvFilter} openModal={openModal} askDel={askDel} delInvoice={delInvoice} printInvoice={printInvoice} />}
          {tab === 'payments' && <RenderPayments payments={payments} openModal={openModal} />}
          {tab === 'inventory' && <RenderInventory inventory={inventory} invTab={invTab} setInvTab={setInvTab} openModal={openModal} />}
          {tab === 'reports' && <RenderReports orders={orders} payments={payments} period={reportPeriod} setPeriod={setReportPeriod} />}
          {tab === 'executives' && <RenderExecutives portalUsers={portalUsers} user={user} states={states} districts={districts} blocks={blocks} panchayats={panchayats} villages={villages} openModal={openModal} askDel={askDel} deletePortalUser={deletePortalUser} />}
          {tab === 'locations' && <RenderLocations states={states} districts={districts} blocks={blocks} villages={villages} openModal={openModal} />}
        </main>
      </div>

      {/* MODAL */}
      {modal && (
        <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-50 overflow-y-auto p-4">
          <div className={`bg-white rounded-2xl shadow-2xl w-full my-4 ${modal.type === 'invoiceDetail' ? 'max-w-4xl' : 'max-w-2xl'}`}>
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="font-semibold text-gray-800">
                {modal.type === 'product' && (modal.data?.id ? 'Edit Product' : 'Add Product')}
                {modal.type === 'category' && 'Manage Categories'}
                {modal.type === 'customer' && (modal.data?.id ? 'Edit Customer' : 'Add Customer')}
                {modal.type === 'order' && (modal.data?.id ? 'Edit Order' : 'New Order')}
                {modal.type === 'orderDetail' && `Order: ${modal.data?.order_number}`}
                {modal.type === 'invoice' && (modal.data?.id ? 'Edit Invoice' : 'Create Invoice')}
                {modal.type === 'invoiceDetail' && `Invoice: ${modal.data?.invoice_number}`}
                {modal.type === 'payment' && 'Record Payment'}
                {modal.type === 'executive' && 'Create Portal User'}
                {modal.type === 'location' && `Add to ${modal.data?.locType}`}
                {modal.type === 'stockAdjust' && `Adjust Stock: ${modal.data?.products?.name}`}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-700 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-xl">✕</button>
            </div>
            <div className="px-6 py-5">
              {err && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm">{err}</div>}
              {modal.type === 'product' && <ProductForm data={modal.data} categories={categories} onSave={saveProduct} onCancel={closeModal} saving={saving} />}
              {modal.type === 'category' && <CatManager cats={categories} onSave={saveCat} onDel={delCat} onClose={closeModal} />}
              {modal.type === 'customer' && <CustomerForm data={modal.data} states={states} districts={districts} blocks={blocks} onSave={saveCust} onCancel={closeModal} saving={saving} />}
              {modal.type === 'order' && <OrderForm data={modal.data} customers={customers} products={products} items={oItems} setItems={setOItems} onSave={saveOrder} onCancel={closeModal} saving={saving} />}
              {modal.type === 'orderDetail' && <OrderDetail order={modal.data} />}
              {modal.type === 'invoice' && <InvoiceForm data={modal.data} orders={orders} customers={customers} states={states} districts={districts} blocks={blocks} onSave={saveInvoice} onCancel={closeModal} saving={saving} />}
              {modal.type === 'invoiceDetail' && <InvoiceDetail invoice={modal.data} user={user} onPrint={() => { printInvoice(modal.data.id) }} />}
              {modal.type === 'payment' && <PaymentForm invoices={invoices} customers={customers} onSave={savePayment} onCancel={closeModal} saving={saving} />}
              {modal.type === 'executive' && <UserCreateForm states={states} districts={districts} blocks={blocks} panchayats={panchayats} villages={villages} onSave={saveAdminUser} onCancel={closeModal} saving={saving} />}
              {modal.type === 'location' && <LocationForm locType={modal.data?.locType} fields={modal.data?.fields} onSave={saveLocation} onCancel={closeModal} />}
              {modal.type === 'stockAdjust' && <StockAdjustForm item={modal.data} onSave={adjustInventory} onCancel={closeModal} />}
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM */}
      {confirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <div className="text-center mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3"><span className="text-2xl">🗑️</span></div>
              <h3 className="font-semibold text-gray-800 mb-1">Confirm Delete</h3>
              <p className="text-sm text-gray-500">{confirm.msg}</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirm(null)} className="flex-1 px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
              <button onClick={() => { confirm.fn(); setConfirm(null) }} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── DASHBOARD ────────────────────────────────────────────────
function RenderDashboard({ orders, customers, invoices, inventory, lowStock }) {
  const totalSales = orders.reduce((s, o) => s + Number(o.total_amount || o.total || 0), 0)
  const pendingDues = invoices.filter(i => i.payment_status !== 'paid').reduce((s, i) => s + Number(i.total_amount || 0), 0)
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - i)
    const k = d.toLocaleDateString('en-IN')
    return { date: k.slice(0, 5), sales: orders.filter(o => new Date(o.created_at).toLocaleDateString('en-IN') === k).reduce((s, o) => s + Number(o.total_amount || 0), 0) }
  }).reverse()
  const statusData = ['pending', 'confirmed', 'dispatched', 'delivered', 'cancelled'].map(s => ({ name: s, value: orders.filter(o => (o.order_status || o.status) === s).length })).filter(d => d.value > 0)
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { l: 'Total Orders', v: orders.length, i: '🛒', c: 'text-blue-600' },
          { l: 'Total Sales', v: cur(totalSales), i: '💰', c: 'text-green-600' },
          { l: 'Customers', v: customers.length, i: '👥', c: 'text-purple-600' },
          { l: 'Pending Dues', v: cur(pendingDues), i: '⏳', c: 'text-orange-600' },
        ].map(s => (
          <div key={s.l} className="bg-white rounded-xl p-4 border shadow-sm">
            <div className="flex justify-between items-start"><div><p className="text-xs text-gray-500 mb-1">{s.l}</p><p className={`text-xl font-bold ${s.c}`}>{s.v}</p></div><span className="text-2xl">{s.i}</span></div>
          </div>
        ))}
      </div>
      {lowStock.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
          <p className="font-semibold text-orange-700 mb-2">⚠️ Low Stock — {lowStock.length} item(s)</p>
          <div className="flex flex-wrap gap-2">{lowStock.map(i => <span key={i.id} className="text-xs bg-orange-100 text-orange-700 border border-orange-200 px-2 py-1 rounded-lg">{i.products?.name || i.product_id}: <b>{i.quantity}</b></span>)}</div>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl p-4 border shadow-sm">
          <p className="font-medium text-gray-700 mb-3 text-sm">Sales Trend (Last 7 Days)</p>
          <ResponsiveContainer width="100%" height={180}><LineChart data={last7}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip formatter={v => cur(v)} /><Line type="monotone" dataKey="sales" stroke="#16a34a" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer>
        </div>
        <div className="bg-white rounded-xl p-4 border shadow-sm">
          <p className="font-medium text-gray-700 mb-3 text-sm">Order Status</p>
          <ResponsiveContainer width="100%" height={180}><PieChart><Pie data={statusData} cx="50%" cy="50%" outerRadius={65} dataKey="value" label={({ name, value }) => `${name}: ${value}`} labelLine={false}>{statusData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % 5]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer>
        </div>
      </div>
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50"><p className="font-medium text-sm text-gray-700">Recent Orders</p></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm"><thead><tr className="text-xs text-gray-500 border-b bg-gray-50"><th className="px-4 py-2 text-left">Order #</th><th className="px-4 py-2 text-left">Customer</th><th className="px-4 py-2 text-left">Total</th><th className="px-4 py-2 text-left">Status</th><th className="px-4 py-2 text-left">Date</th></tr></thead>
            <tbody>{orders.slice(0, 5).map(o => <tr key={o.id} className="border-b hover:bg-gray-50"><td className="px-4 py-2 font-medium text-blue-600">{o.order_number}</td><td className="px-4 py-2">{o.customer_name || o.customers?.name}</td><td className="px-4 py-2 font-medium">{cur(o.total_amount || o.total)}</td><td className="px-4 py-2"><Badge s={o.order_status || o.status} /></td><td className="px-4 py-2 text-gray-500">{fmtDate(o.created_at)}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── PRODUCTS ─────────────────────────────────────────────────
function RenderProducts({ products, categories, inventory, openModal, askDel, delProduct }) {
  const [search, setSearch] = useState('')
  const active = products.filter(p => p.is_active !== false && (!search || p.name.toLowerCase().includes(search.toLowerCase()) || p.product_code?.toLowerCase().includes(search.toLowerCase())))
  const catMap = Object.fromEntries(categories.map(c => [c.id, c.name]))
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products..." className="border rounded-lg px-3 py-1.5 text-sm w-52 focus:outline-none focus:ring-2 focus:ring-green-500" />
        <div className="flex gap-2">
          <button onClick={() => openModal('category')} className="px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50">Categories</button>
          <button onClick={() => openModal('product')} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 font-medium">+ Add Product</button>
        </div>
      </div>
      <div className="bg-white rounded-xl border shadow-sm overflow-x-auto">
        <table className="w-full text-sm"><thead><tr className="bg-gray-50 text-xs text-gray-500 border-b">
          <th className="px-3 py-3 text-left">Code</th><th className="px-3 py-3 text-left">Name</th><th className="px-3 py-3 text-left">Cat.</th>
          <th className="px-3 py-3 text-left">Unit</th><th className="px-3 py-3 text-right">MRP</th><th className="px-3 py-3 text-right">CNF</th>
          <th className="px-3 py-3 text-right">DD</th><th className="px-3 py-3 text-right">B/T</th><th className="px-3 py-3 text-right">KSK</th>
          <th className="px-3 py-3 text-right">Farmer</th><th className="px-3 py-3 text-center">GST%</th>
          <th className="px-3 py-3 text-center">Stock</th><th className="px-3 py-3 text-left">Actions</th>
        </tr></thead>
          <tbody>{active.map(p => {
            const inv = inventory.find(i => i.product_id === p.id)
            return (
              <tr key={p.id} className="border-b hover:bg-gray-50">
                <td className="px-3 py-2 font-mono text-xs text-gray-500">{p.product_code}</td>
                <td className="px-3 py-2"><p className="font-medium">{p.name}</p><p className="text-xs text-gray-400">{p.pack_size ? `Pack: ${p.pack_size}` : ''}</p></td>
                <td className="px-3 py-2 text-xs text-gray-500">{catMap[p.category_id] || '-'}</td>
                <td className="px-3 py-2 text-gray-500 text-xs">{p.unit}</td>
                <td className="px-3 py-2 text-right font-semibold text-gray-800">{p.mrp ? cur(p.mrp) : '-'}</td>
                <td className="px-3 py-2 text-right text-blue-700">{p.price_cnf ? cur(p.price_cnf) : '-'}</td>
                <td className="px-3 py-2 text-right text-indigo-600">{p.price_dd ? cur(p.price_dd) : '-'}</td>
                <td className="px-3 py-2 text-right text-purple-600">{p.price_btd ? cur(p.price_btd) : '-'}</td>
                <td className="px-3 py-2 text-right text-cyan-700">{p.price_ksk ? cur(p.price_ksk) : '-'}</td>
                <td className="px-3 py-2 text-right text-green-700">{p.price_farmer ? cur(p.price_farmer) : '-'}</td>
                <td className="px-3 py-2 text-center text-xs">{p.gst_rate}%</td>
                <td className="px-3 py-2 text-center"><span className={`font-semibold text-xs ${(inv?.quantity || 0) < (inv?.reorder_level || 10) ? 'text-red-600' : 'text-green-600'}`}>{inv?.quantity ?? '—'}</span></td>
                <td className="px-3 py-2"><Btns onEdit={() => openModal('product', p)} onDel={() => askDel(`Delete "${p.name}"?`, () => delProduct(p.id))} /></td>
              </tr>
            )
          })}
            {active.length === 0 && <tr><td colSpan={13} className="px-4 py-8 text-center text-gray-400">No products found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── CUSTOMERS ────────────────────────────────────────────────
function RenderCustomers({ customers, openModal, askDel, delCust }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <p className="text-sm text-gray-500">{customers.length} customers</p>
        <button onClick={() => openModal('customer')} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 font-medium">+ Add Customer</button>
      </div>
      <div className="bg-white rounded-xl border shadow-sm overflow-x-auto">
        <table className="w-full text-sm"><thead><tr className="bg-gray-50 text-xs text-gray-500 border-b">
          <th className="px-4 py-3 text-left">Code</th><th className="px-4 py-3 text-left">Name</th><th className="px-4 py-3 text-left">Phone</th>
          <th className="px-4 py-3 text-left">GST No.</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-left">Actions</th>
        </tr></thead>
          <tbody>{customers.map(c => (
            <tr key={c.id} className="border-b hover:bg-gray-50">
              <td className="px-4 py-3 font-mono text-xs text-gray-500">{c.customer_code}</td>
              <td className="px-4 py-3"><p className="font-medium">{c.name}</p><p className="text-xs text-gray-400">{c.email}</p></td>
              <td className="px-4 py-3 text-gray-600">{c.phone}</td>
              <td className="px-4 py-3 text-xs text-gray-500">{c.gst_number}</td>
              <td className="px-4 py-3"><Badge s={c.is_active ? 'active' : 'inactive'} /></td>
              <td className="px-4 py-3"><Btns onEdit={() => openModal('customer', c)} onDel={() => askDel(`Delete "${c.name}"?`, () => delCust(c.id))} /></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  )
}

// ─── ORDERS (EDIT + DELETE) ───────────────────────────────────
function RenderOrders({ orders, customers, products, filter, setFilter, openModal, askDel, delOrder, setOItems, openEditOrder }) {
  const statuses = ['all', 'pending', 'confirmed', 'dispatched', 'delivered', 'cancelled']
  const filtered = filter === 'all' ? orders : orders.filter(o => (o.order_status || o.status) === filter)
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex flex-wrap gap-1.5">
          {statuses.map(s => (
            <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${filter === s ? 'bg-green-600 text-white border-green-600' : 'hover:bg-gray-50 text-gray-600'}`}>
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)} <span className="opacity-75">({s === 'all' ? orders.length : orders.filter(o => (o.order_status||o.status) === s).length})</span>
            </button>
          ))}
        </div>
        <button onClick={() => { setOItems([]); openModal('order') }} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 font-medium">+ New Order</button>
      </div>
      <div className="bg-white rounded-xl border shadow-sm overflow-x-auto">
        <table className="w-full text-sm"><thead><tr className="bg-gray-50 text-xs text-gray-500 border-b">
          <th className="px-4 py-3 text-left">Order #</th><th className="px-4 py-3 text-left">Customer</th>
          <th className="px-4 py-3 text-left">Total</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-left">Date</th><th className="px-4 py-3 text-left">Actions</th>
        </tr></thead>
          <tbody>
            {filtered.map(o => (
              <tr key={o.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3 font-semibold text-blue-600">{o.order_number}</td>
                <td className="px-4 py-3">{o.customer_name || o.customers?.name}</td>
                <td className="px-4 py-3 font-semibold">{cur(o.total_amount || o.total)}</td>
                <td className="px-4 py-3"><Badge s={o.order_status || o.status} /></td>
                <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(o.created_at)}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 flex-wrap">
                    <button onClick={() => openModal('orderDetail', o)} className="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 font-medium">View</button>
                    <button onClick={() => openEditOrder(o)} className="px-2 py-1 text-xs bg-amber-50 text-amber-600 rounded-lg hover:bg-amber-100 font-medium">Edit</button>
                    <button onClick={() => askDel(`Delete order "${o.order_number}"?`, () => delOrder(o.id))} className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded-lg hover:bg-red-100 font-medium">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">No orders found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── INVOICES (EDIT + DELETE) ─────────────────────────────────
function RenderInvoices({ invoices, filter, setFilter, openModal, askDel, delInvoice, printInvoice }) {
  const statuses = ['all', 'pending', 'partial', 'paid']
  const filtered = filter === 'all' ? invoices : invoices.filter(i => i.payment_status === filter)
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex flex-wrap gap-1.5">
          {statuses.map(s => (
            <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${filter === s ? 'bg-green-600 text-white border-green-600' : 'hover:bg-gray-50 text-gray-600'}`}>
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)} <span className="opacity-75">({s === 'all' ? invoices.length : invoices.filter(i => i.payment_status === s).length})</span>
            </button>
          ))}
        </div>
        <button onClick={() => openModal('invoice')} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 font-medium">+ Create Invoice</button>
      </div>
      <div className="bg-white rounded-xl border shadow-sm overflow-x-auto">
        <table className="w-full text-sm"><thead><tr className="bg-gray-50 text-xs text-gray-500 border-b">
          <th className="px-4 py-3 text-left">Invoice #</th><th className="px-4 py-3 text-left">Customer</th>
          <th className="px-4 py-3 text-left">Subtotal</th><th className="px-4 py-3 text-left">CGST</th><th className="px-4 py-3 text-left">SGST</th>
          <th className="px-4 py-3 text-left">Total</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-left">Date</th><th className="px-4 py-3 text-left">Actions</th>
        </tr></thead>
          <tbody>
            {filtered.map(inv => (
              <tr key={inv.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3 font-semibold text-blue-600">{inv.invoice_number}</td>
                <td className="px-4 py-3">{inv.customers?.name || inv.customer_name || '-'}</td>
                <td className="px-4 py-3">{cur(inv.subtotal)}</td>
                <td className="px-4 py-3">{cur(inv.cgst_amount)}</td>
                <td className="px-4 py-3">{cur(inv.sgst_amount)}</td>
                <td className="px-4 py-3 font-semibold">{cur(inv.total_amount)}</td>
                <td className="px-4 py-3"><Badge s={inv.payment_status} /></td>
                <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(inv.invoice_date || inv.created_at)}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 flex-wrap">
                    <button onClick={() => openModal('invoiceDetail', inv)} className="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 font-medium">View</button>
                    <button onClick={() => openModal('invoice', inv)} className="px-2 py-1 text-xs bg-amber-50 text-amber-600 rounded-lg hover:bg-amber-100 font-medium">Edit</button>
                    <button onClick={() => askDel(`Delete invoice "${inv.invoice_number}"?`, () => delInvoice(inv.id))} className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded-lg hover:bg-red-100 font-medium">Delete</button>
                    <button onClick={() => printInvoice(inv.id)} className="px-2 py-1 text-xs bg-gray-50 text-gray-600 rounded-lg hover:bg-gray-100 font-medium">Print</button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-400">No invoices found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── PAYMENTS ─────────────────────────────────────────────────
function RenderPayments({ payments, openModal }) {
  const total = payments.reduce((s, p) => s + Number(p.amount || 0), 0)
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <p className="text-sm text-gray-500">{payments.length} payments · Total: <span className="font-semibold text-green-600">{cur(total)}</span></p>
        <button onClick={() => openModal('payment')} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 font-medium">+ Record Payment</button>
      </div>
      <div className="bg-white rounded-xl border shadow-sm overflow-x-auto">
        <table className="w-full text-sm"><thead><tr className="bg-gray-50 text-xs text-gray-500 border-b">
          <th className="px-4 py-3 text-left">Payment #</th><th className="px-4 py-3 text-left">Invoice</th>
          <th className="px-4 py-3 text-left">Customer</th><th className="px-4 py-3 text-left">Amount</th><th className="px-4 py-3 text-left">Mode</th><th className="px-4 py-3 text-left">Date</th>
        </tr></thead>
          <tbody>{payments.map(p => (
            <tr key={p.id} className="border-b hover:bg-gray-50">
              <td className="px-4 py-3 font-medium">{p.payment_number}</td>
              <td className="px-4 py-3 text-blue-600">{p.invoices?.invoice_number || p.invoice_number}</td>
              <td className="px-4 py-3">{p.customers?.name || p.customer_name}</td>
              <td className="px-4 py-3 font-semibold text-green-600">{cur(p.amount)}</td>
              <td className="px-4 py-3 capitalize text-gray-500">{p.payment_mode?.replace(/_/g, ' ')}</td>
              <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(p.payment_date || p.created_at)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  )
}

// ─── INVENTORY ────────────────────────────────────────────────
function RenderInventory({ inventory, invTab, setInvTab, openModal }) {
  const totalItems = inventory.length
  const inStock = inventory.filter(i => i.quantity > 0).length
  const lowStock = inventory.filter(i => i.quantity > 0 && i.quantity < i.reorder_level).length
  const outOfStock = inventory.filter(i => i.quantity === 0).length
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        {[
          { l: 'Total Items', v: totalItems, c: 'text-gray-700', bg: 'bg-white' },
          { l: 'In Stock', v: inStock, c: 'text-green-700', bg: 'bg-green-50' },
          { l: 'Low Stock', v: lowStock, c: 'text-orange-700', bg: 'bg-orange-50' },
          { l: 'Out of Stock', v: outOfStock, c: 'text-red-700', bg: 'bg-red-50' },
        ].map(s => <div key={s.l} className={`${s.bg} rounded-xl p-4 border shadow-sm text-center`}><p className="text-xs text-gray-500 mb-1">{s.l}</p><p className={`text-2xl font-bold ${s.c}`}>{s.v}</p></div>)}
      </div>
      <div className="bg-white rounded-xl border shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="bg-gray-50 text-xs text-gray-500 border-b">
            <th className="px-4 py-3 text-left">Code</th>
            <th className="px-4 py-3 text-left">Product</th>
            <th className="px-4 py-3 text-left">MRP</th>
            <th className="px-4 py-3 text-center">Quantity</th>
            <th className="px-4 py-3 text-center">Reorder</th>
            <th className="px-4 py-3 text-left">Status</th>
            <th className="px-4 py-3 text-left">Actions</th>
          </tr></thead>
          <tbody>{inventory.map(i => (
            <tr key={i.id} className="border-b hover:bg-gray-50">
              <td className="px-4 py-3 font-mono text-xs text-gray-500">{i.products?.product_code}</td>
              <td className="px-4 py-3 font-medium">{i.products?.name}</td>
              <td className="px-4 py-3 text-gray-500 text-xs">{i.products?.mrp ? cur(i.products.mrp) : '-'}</td>
              <td className="px-4 py-3 text-center font-bold text-lg">{i.quantity}</td>
              <td className="px-4 py-3 text-center text-gray-500 text-xs">{i.reorder_level}</td>
              <td className="px-4 py-3">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${i.quantity === 0 ? 'bg-red-100 text-red-700' : i.quantity < i.reorder_level ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                  {i.quantity === 0 ? 'Out of Stock' : i.quantity < i.reorder_level ? 'Low Stock' : 'In Stock'}
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-1">
                  <button onClick={() => openModal('stockAdjust', { ...i, _type: 'in' })} className="px-2 py-1 text-xs bg-green-50 text-green-700 rounded-lg hover:bg-green-100 font-bold">+ Add</button>
                  <button onClick={() => openModal('stockAdjust', { ...i, _type: 'out' })} className="px-2 py-1 text-xs bg-red-50 text-red-700 rounded-lg hover:bg-red-100 font-bold">− Remove</button>
                </div>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  )
}

function StockAdjustForm({ item, onSave, onCancel }) {
  const [qty, setQty] = useState(1)
  const [type, setType] = useState(item?._type || 'in')
  const [note, setNote] = useState('')
  const cur2 = item?.quantity || 0
  const newQty = type === 'in' ? cur2 + Number(qty) : Math.max(0, cur2 - Number(qty))
  return (
    <div className="space-y-4">
      <div className="bg-blue-50 rounded-xl p-4 text-sm">
        <div className="font-semibold text-gray-700">{item?.products?.name}</div>
        <div className="text-gray-500 text-xs">{item?.products?.product_code}</div>
        <div className="mt-2 text-gray-600">Current Stock: <span className="font-bold text-lg text-gray-800">{cur2}</span> units</div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FRow label="Type">
          <select className={sel} value={type} onChange={e => setType(e.target.value)}>
            <option value="in">Stock In (Add)</option>
            <option value="out">Stock Out (Remove)</option>
          </select>
        </FRow>
        <FRow label="Quantity">
          <input className={inp} type="number" min="1" value={qty} onChange={e => setQty(Math.max(1, Number(e.target.value)))} />
        </FRow>
      </div>
      <FRow label="Remarks (optional)">
        <input className={inp} value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Purchase from supplier, Returned goods..." />
      </FRow>
      <div className={`flex items-center gap-3 p-3 rounded-xl text-sm font-medium ${type === 'in' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
        <span>{type === 'in' ? '▲' : '▼'}</span>
        <span>{cur2} → <strong>{newQty}</strong> units after adjustment</span>
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button onClick={onCancel} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Cancel</button>
        <button onClick={() => onSave(item, Number(qty), type)} className={`px-5 py-2 text-white rounded-lg text-sm font-medium ${type === 'in' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}>
          Confirm {type === 'in' ? '+ Add Stock' : '− Remove Stock'}
        </button>
      </div>
    </div>
  )
}

// ─── REPORTS ──────────────────────────────────────────────────
function RenderReports({ orders, payments, period, setPeriod }) {
  const cutoff = new Date(Date.now() - period * 86400000)
  const po = orders.filter(o => new Date(o.created_at) >= cutoff)
  const pp = payments.filter(p => new Date(p.created_at || p.payment_date) >= cutoff)
  return (
    <div className="space-y-5">
      <div className="flex gap-2">{[7, 30, 90].map(p => <button key={p} onClick={() => setPeriod(p)} className={`px-4 py-2 rounded-lg text-sm font-medium border ${period === p ? 'bg-green-600 text-white border-green-600' : 'hover:bg-gray-50'}`}>Last {p} days</button>)}</div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { l: 'Orders', v: po.length },
          { l: 'Revenue', v: cur(po.reduce((s, o) => s + Number(o.total_amount || 0), 0)) },
          { l: 'Payments Received', v: cur(pp.reduce((s, p) => s + Number(p.amount || 0), 0)) },
        ].map(s => <div key={s.l} className="bg-white rounded-xl p-5 border shadow-sm text-center"><p className="text-gray-500 text-sm mb-1">{s.l}</p><p className="text-2xl font-bold text-gray-800">{s.v}</p></div>)}
      </div>
    </div>
  )
}

// ─── EXECUTIVES ───────────────────────────────────────────────
const ROLE_COLOR = {
  super_admin: 'bg-purple-100 text-purple-700', state_admin: 'bg-blue-100 text-blue-700',
  district_admin: 'bg-indigo-100 text-indigo-700', block_admin: 'bg-cyan-100 text-cyan-700',
  marketing_executive: 'bg-green-100 text-green-700', accountant: 'bg-yellow-100 text-yellow-700',
  retailer: 'bg-orange-100 text-orange-700',
}

function UserProfileModal({ u, panchayats, villages, onClose }) {
  const [profile, setProfile] = useState(null)
  useEffect(() => {
    adminFetch('select', 'sales_targets', null, { qs: `user_id=eq.${u.id}&status=eq.executive_profile&limit=1` })
      .then(rows => { if (Array.isArray(rows) && rows[0]) setProfile(rows[0].incentive_slab || {}) })
  }, [u.id])
  const panch = panchayats.find(p => p.id === profile?.panchayat_id)
  const vill = villages.find(v => v.id === profile?.village_id)
  const locationParts = [u.states?.name, u.districts?.name, u.blocks?.name, panch?.name, vill?.name].filter(Boolean)
  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="font-bold text-gray-800">User Profile</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-xl">✕</button>
        </div>
        <div className="p-6 space-y-4">
          {/* Header */}
          <div className="flex items-center gap-4">
            {profile?.photo_url
              ? <img src={profile.photo_url} alt="photo" className="w-20 h-24 rounded-xl object-cover border-2 border-green-300" />
              : <div className="w-20 h-24 bg-green-100 rounded-xl flex items-center justify-center"><span className="text-green-700 font-bold text-3xl">{(u.first_name?.[0] || '?').toUpperCase()}</span></div>
            }
            <div>
              <p className="text-xl font-bold text-gray-800">{u.first_name} {u.last_name || ''}</p>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLOR[u.role] || 'bg-gray-100 text-gray-600'}`}>{ROLE_LABEL[u.role] || u.role}</span>
              {profile?.employee_id && <p className="text-xs text-gray-500 mt-1">ID: {profile.employee_id}</p>}
              {profile?.joining_date && <p className="text-xs text-gray-500">Joined: {fmtDate(profile.joining_date)}</p>}
            </div>
          </div>
          {/* Contact */}
          <div className="bg-gray-50 rounded-xl p-3 space-y-1 text-sm">
            <p>📧 {u.email}</p>
            {u.phone && <p>📞 {u.phone}</p>}
            {profile?.address && <p>🏠 {profile.address}</p>}
          </div>
          {/* ID Docs */}
          {(profile?.aadhaar_no || profile?.pan_no) && (
            <div className="bg-blue-50 rounded-xl p-3 space-y-1 text-sm">
              <p className="text-xs font-bold text-blue-700 uppercase tracking-widest mb-2">ID Documents</p>
              {profile.aadhaar_no && <p>🪪 Aadhaar: <span className="font-mono">{profile.aadhaar_no}</span></p>}
              {profile.pan_no && <p>📄 PAN: <span className="font-mono">{profile.pan_no}</span></p>}
            </div>
          )}
          {/* Emergency Contacts */}
          {(profile?.emergency1?.name || profile?.emergency2?.name) && (
            <div className="bg-amber-50 rounded-xl p-3 space-y-1 text-sm">
              <p className="text-xs font-bold text-amber-700 uppercase tracking-widest mb-2">Emergency Contacts</p>
              {profile.emergency1?.name && <p>👤 {profile.emergency1.name} <span className="text-gray-500">({profile.emergency1.relationship})</span></p>}
              {profile.emergency2?.name && <p>👤 {profile.emergency2.name} <span className="text-gray-500">({profile.emergency2.relationship})</span></p>}
            </div>
          )}
          {/* Working Area */}
          {locationParts.length > 0 && (
            <div className="bg-purple-50 rounded-xl p-3 text-sm">
              <p className="text-xs font-bold text-purple-700 uppercase tracking-widest mb-2">Working Area</p>
              <p className="text-purple-700">📍 {locationParts.join(' → ')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function RenderExecutives({ portalUsers, user, states, districts, blocks, panchayats, villages, openModal, askDel, deletePortalUser }) {
  const [roleFilter, setRoleFilter] = useState('all')
  const [viewUser, setViewUser] = useState(null)
  const roles = ['all', 'state_admin', 'district_admin', 'block_admin', 'marketing_executive', 'accountant', 'retailer']
  const filtered = roleFilter === 'all' ? portalUsers : portalUsers.filter(u => u.role === roleFilter)
  const isAdmin = user?.role === 'super_admin' || user?.role === 'state_admin'
  return (
    <div className="space-y-4">
      {viewUser && <UserProfileModal u={viewUser} panchayats={panchayats} villages={villages} onClose={() => setViewUser(null)} />}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex flex-wrap gap-1.5">
          {roles.map(r => (
            <button key={r} onClick={() => setRoleFilter(r)} className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${roleFilter === r ? 'bg-green-600 text-white border-green-600' : 'hover:bg-gray-50 text-gray-600'}`}>
              {r === 'all' ? `All (${portalUsers.length})` : ROLE_LABEL[r] || r}
            </button>
          ))}
        </div>
        {isAdmin && <button onClick={() => openModal('executive')} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 font-medium">+ Create User</button>}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(u => {
          const locationParts = [u.states?.name, u.districts?.name, u.blocks?.name].filter(Boolean)
          return (
            <div key={u.id} className="bg-white rounded-xl p-4 border shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => setViewUser(u)}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-green-700 font-bold text-lg">{(u.first_name?.[0] || u.email?.[0] || '?').toUpperCase()}</span>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800">{u.first_name} {u.last_name || ''}</p>
                    <p className="text-xs text-gray-500">{u.email}</p>
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLOR[u.role] || 'bg-gray-100 text-gray-600'}`}>{ROLE_LABEL[u.role] || u.role}</span>
              </div>
              {u.phone && <p className="text-xs text-gray-500 mb-1">📞 {u.phone}</p>}
              {locationParts.length > 0 && (
                <p className="text-xs text-blue-600 bg-blue-50 rounded px-2 py-1 mb-2">📍 {locationParts.join(' → ')}</p>
              )}
              <div className="flex items-center justify-between pt-2 border-t mt-2" onClick={e => e.stopPropagation()}>
                <span className={`text-xs px-2 py-0.5 rounded-full ${u.is_active !== false ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>{u.is_active !== false ? 'Active' : 'Inactive'}</span>
                {isAdmin && u.id !== user?.id && (
                  <button onClick={() => askDel(`Delete user "${u.first_name} ${u.last_name || ''}"?`, () => deletePortalUser(u.id))} className="text-xs text-red-400 hover:text-red-600 px-2 py-0.5 rounded hover:bg-red-50">Delete</button>
                )}
              </div>
            </div>
          )
        })}
        {filtered.length === 0 && <p className="text-gray-400 col-span-3 text-center py-12">No users found</p>}
      </div>
    </div>
  )
}

// ─── LOCATIONS ────────────────────────────────────────────────
function RenderLocations({ states, districts, blocks, villages, openModal }) {
  const locs = [
    { key: 'states', l: 'States', items: states, fields: [{ n: 'name', l: 'State Name' }, { n: 'code', l: 'State Code' }] },
    { key: 'districts', l: 'Districts', items: districts, fields: [{ n: 'name', l: 'District Name' }, { n: 'code', l: 'Code' }, { n: 'state_id', l: 'State', type: 'select', opts: states }] },
    { key: 'blocks', l: 'Blocks', items: blocks.slice(0, 50), total: blocks.length, fields: [{ n: 'name', l: 'Block Name' }, { n: 'code', l: 'Code' }, { n: 'district_id', l: 'District', type: 'select', opts: districts }] },
    { key: 'villages', l: 'Villages', items: villages.slice(0, 50), total: villages.length, fields: [{ n: 'name', l: 'Village Name' }, { n: 'code', l: 'Code' }] },
  ]
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {locs.map(loc => (
        <div key={loc.key} className="bg-white rounded-xl border shadow-sm">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h3 className="font-medium text-sm">{loc.l} <span className="text-gray-400 font-normal">({loc.total || loc.items.length})</span></h3>
            <button onClick={() => openModal('location', { locType: loc.key, fields: loc.fields })} className="text-xs text-green-600 hover:underline font-medium">+ Add</button>
          </div>
          <div className="p-3 max-h-48 overflow-y-auto divide-y">
            {loc.items.map(i => <p key={i.id} className="py-1.5 text-sm text-gray-600">{i.name} {i.code ? <span className="text-xs text-gray-400">({i.code})</span> : ''}</p>)}
            {loc.total > 50 && <p className="text-xs text-gray-400 py-2">... and {loc.total - 50} more</p>}
            {loc.items.length === 0 && <p className="text-xs text-gray-400 py-2">No entries</p>}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── AUTH FORMS ───────────────────────────────────────────────
function AuthLogin({ onLogin, loading }) {
  const [f, setF] = useState({ email: '', password: '' })
  return (
    <div className="space-y-4">
      <FRow label="Email" required><input className={inp} type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} placeholder="you@soil.com" /></FRow>
      <FRow label="Password" required><input className={inp} type="password" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} onKeyDown={e => e.key === 'Enter' && onLogin(f.email, f.password)} placeholder="••••••••" /></FRow>
      <button onClick={() => onLogin(f.email, f.password)} disabled={loading} className="w-full py-2.5 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-60">
        {loading ? 'Signing in...' : 'Sign In'}
      </button>
    </div>
  )
}
function AuthSignup({ onSignup, loading }) {
  const [f, setF] = useState({ first_name: '', email: '', password: '', role: 'marketing_executive' })
  return (
    <div className="space-y-4">
      <FRow label="Full Name" required><input className={inp} value={f.first_name} onChange={e => setF({ ...f, first_name: e.target.value })} /></FRow>
      <FRow label="Email" required><input className={inp} type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></FRow>
      <FRow label="Password" required><input className={inp} type="password" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} /></FRow>
      <FRow label="Role"><select className={sel} value={f.role} onChange={e => setF({ ...f, role: e.target.value })}>
        {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select></FRow>
      <button onClick={() => onSignup(f)} disabled={loading} className="w-full py-2.5 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-60">
        {loading ? 'Creating...' : 'Create Account'}
      </button>
    </div>
  )
}

// ─── PRODUCT FORM ─────────────────────────────────────────────
function ProductForm({ data, categories, onSave, onCancel, saving }) {
  const [f, setF] = useState(data || { name: '', description: '', hsn_code: '', unit: 'KG', pack_size: '', gst_rate: 5, mrp: '', price_cnf: '', price_dd: '', price_btd: '', price_ksk: '', price_farmer: '', category_id: '', is_active: true })
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <FRow label="Product Name" required><input className={inp} value={f.name} onChange={e => set('name', e.target.value)} /></FRow>
        <FRow label="HSN Code"><input className={inp} value={f.hsn_code} onChange={e => set('hsn_code', e.target.value)} /></FRow>
        <FRow label="Unit"><select className={sel} value={f.unit} onChange={e => set('unit', e.target.value)}>{['KG', 'L', 'LTR', 'PCS', 'BAG', 'BOX', 'GM'].map(u => <option key={u}>{u}</option>)}</select></FRow>
        <FRow label="Pack Size"><input className={inp} value={f.pack_size} onChange={e => set('pack_size', e.target.value)} /></FRow>
        <FRow label="GST Rate %"><select className={sel} value={f.gst_rate} onChange={e => set('gst_rate', Number(e.target.value))}>{[0, 5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}</select></FRow>
        <FRow label="Category"><select className={sel} value={f.category_id} onChange={e => set('category_id', e.target.value)}>
          <option value="">Select...</option>{categories.filter(c => c.is_active !== false).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></FRow>
      </div>
      <FRow label="Description"><textarea className={inp} rows={2} value={f.description} onChange={e => set('description', e.target.value)} /></FRow>
      <div className="border-t pt-4"><p className="text-xs font-semibold text-gray-500 uppercase mb-3">Pricing (₹)</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[['mrp', 'MRP'], ['price_cnf', 'CNF Rate'], ['price_dd', 'DD Rate'], ['price_btd', 'B/T Rate'], ['price_ksk', 'KSK Rate'], ['price_farmer', 'Farmer Rate']].map(([k, l]) => (
            <FRow key={k} label={l}><input className={inp} type="number" value={f[k]} onChange={e => set(k, e.target.value)} /></FRow>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button onClick={onCancel} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Cancel</button>
        <button onClick={() => onSave(f)} disabled={saving} className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-60">{saving ? 'Saving...' : 'Save Product'}</button>
      </div>
    </div>
  )
}

// ─── CATEGORY MANAGER ─────────────────────────────────────────
function CatManager({ cats, onSave, onDel, onClose }) {
  const [name, setName] = useState('')
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input className={inp} value={name} onChange={e => setName(e.target.value)} placeholder="Category name" />
        <button onClick={() => { if (name.trim()) { onSave({ name: name.trim() }); setName('') } }} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 whitespace-nowrap">Add</button>
      </div>
      <div className="divide-y max-h-60 overflow-y-auto border rounded-lg">
        {cats.filter(c => c.is_active !== false).map(c => (
          <div key={c.id} className="flex items-center justify-between px-3 py-2">
            <span className="text-sm">{c.name}</span>
            <button onClick={() => onDel(c.id)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
          </div>
        ))}
      </div>
      <div className="flex justify-end"><button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Close</button></div>
    </div>
  )
}

// ─── CUSTOMER FORM ────────────────────────────────────────────
function CustomerForm({ data, states, districts, blocks, onSave, onCancel, saving }) {
  const [f, setF] = useState(data || { name: '', phone: '', email: '', address: '', gst_number: '', credit_limit: 0, state_id: '', district_id: '', block_id: '', is_active: true })
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <FRow label="Customer Name" required><input className={inp} value={f.name} onChange={e => set('name', e.target.value)} /></FRow>
        <FRow label="Phone"><input className={inp} value={f.phone} onChange={e => set('phone', e.target.value)} /></FRow>
        <FRow label="Email"><input className={inp} type="email" value={f.email} onChange={e => set('email', e.target.value)} /></FRow>
        <FRow label="GST Number"><input className={inp} value={f.gst_number} onChange={e => set('gst_number', e.target.value)} /></FRow>
        <FRow label="Credit Limit"><input className={inp} type="number" value={f.credit_limit} onChange={e => set('credit_limit', e.target.value)} /></FRow>
        <FRow label="State"><select className={sel} value={f.state_id} onChange={e => set('state_id', e.target.value)}>
          <option value="">Select state...</option>{states.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select></FRow>
      </div>
      <FRow label="Address"><textarea className={inp} rows={2} value={f.address} onChange={e => set('address', e.target.value)} /></FRow>
      <div className="flex justify-end gap-3 pt-2">
        <button onClick={onCancel} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Cancel</button>
        <button onClick={() => onSave(f)} disabled={saving} className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-60">{saving ? 'Saving...' : 'Save Customer'}</button>
      </div>
    </div>
  )
}

// ─── ORDER FORM ───────────────────────────────────────────────
function OrderForm({ data, customers, products, items, setItems, onSave, onCancel, saving }) {
  const [custId, setCustId] = useState(data?.customer_id || data?.customers?.id || '')
  const [status, setStatus] = useState(data?.order_status || data?.status || 'pending')

  useEffect(() => {
    if (data?.id) {
      if (data.customer_id || data.customers?.id) setCustId(data.customer_id || data.customers?.id)
    }
  }, [data?.id])

  const addItem = pid => {
    const p = products.find(x => x.id === pid); if (!p) return
    const exist = items.find(i => i.product_id === pid)
    if (exist) setItems(items.map(i => i.product_id === pid ? { ...i, qty: i.qty + 1, amount: (i.qty + 1) * i.rate } : i))
    else setItems([...items, { product_id: p.id, product_name: p.name, qty: 1, rate: Number(p.price_cnf || p.mrp || 0), gst_rate: Number(p.gst_rate || 0), amount: Number(p.price_cnf || p.mrp || 0) }])
  }
  const updItem = (pid, k, v) => setItems(items.map(i => i.product_id === pid ? { ...i, [k]: Number(v), amount: k === 'qty' ? Number(v) * i.rate : i.qty * Number(v) } : i))
  const remItem = pid => setItems(items.filter(i => i.product_id !== pid))
  const sub = items.reduce((s, i) => s + i.qty * i.rate, 0)
  const tax = items.reduce((s, i) => s + i.qty * i.rate * i.gst_rate / 100, 0)
  const cust = customers.find(c => c.id === custId)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <FRow label="Customer" required>
          <select className={sel} value={custId} onChange={e => setCustId(e.target.value)}>
            <option value="">Select customer...</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.customer_code})</option>)}
          </select>
        </FRow>
        <FRow label="Status">
          <select className={sel} value={status} onChange={e => setStatus(e.target.value)}>
            {['pending', 'confirmed', 'dispatched', 'delivered', 'cancelled'].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
        </FRow>
      </div>
      <FRow label="Add Product">
        <select className={sel} onChange={e => { if (e.target.value) { addItem(e.target.value); e.target.value = '' } }} defaultValue="">
          <option value="">Select product...</option>
          {products.filter(p => p.is_active !== false).map(p => <option key={p.id} value={p.id}>{p.name} — {cur(p.price_cnf || p.mrp)}/{p.unit}</option>)}
        </select>
      </FRow>
      {items.length > 0 && (
        <div className="border rounded-xl overflow-hidden">
          <table className="w-full text-sm"><thead><tr className="bg-gray-50 text-xs text-gray-500"><th className="px-3 py-2 text-left">Product</th><th className="px-3 py-2">Qty</th><th className="px-3 py-2">Rate</th><th className="px-3 py-2">GST%</th><th className="px-3 py-2 text-right">Amount</th><th></th></tr></thead>
            <tbody>{items.map(i => (
              <tr key={i.product_id} className="border-t">
                <td className="px-3 py-2 font-medium">{i.product_name}</td>
                <td className="px-3 py-2"><input type="number" min="1" className="border rounded px-2 py-1 text-xs w-16" value={i.qty} onChange={e => updItem(i.product_id, 'qty', e.target.value)} /></td>
                <td className="px-3 py-2"><input type="number" className="border rounded px-2 py-1 text-xs w-20" value={i.rate} onChange={e => updItem(i.product_id, 'rate', e.target.value)} /></td>
                <td className="px-3 py-2 text-center text-gray-500">{i.gst_rate}%</td>
                <td className="px-3 py-2 text-right font-medium">{cur(i.qty * i.rate)}</td>
                <td className="px-3 py-2"><button onClick={() => remItem(i.product_id)} className="text-red-400 hover:text-red-600 px-1">✕</button></td>
              </tr>
            ))}</tbody>
          </table>
          <div className="bg-gray-50 px-3 py-2 text-sm space-y-1 border-t">
            <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{cur(sub)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Tax</span><span>{cur(tax)}</span></div>
            <div className="flex justify-between font-bold text-base border-t pt-1"><span>Total</span><span className="text-green-600">{cur(sub + tax)}</span></div>
          </div>
        </div>
      )}
      <div className="flex justify-end gap-3 pt-2">
        <button onClick={onCancel} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Cancel</button>
        <button onClick={() => { if (!custId) { alert('Please select a customer'); return } if (items.length === 0) { alert('Please add at least one product'); return } onSave({ ...(data || {}), customer_id: custId, order_status: status, items }) }} disabled={saving} className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-60">
          {saving ? 'Saving...' : data?.id ? 'Update Order' : 'Create Order'}
        </button>
      </div>
    </div>
  )
}

function OrderDetail({ order }) {
  const [items, setItems] = useState([])
  const [loadingItems, setLoadingItems] = useState(true)
  useEffect(() => {
    if (!order?.id) return
    supabase.from('order_items').select('*, products(name)').eq('order_id', order.id)
      .then(({ data }) => { setItems(data || []); setLoadingItems(false) })
  }, [order?.id])
  if (!order) return null
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div><span className="text-gray-500">Order #:</span> <span className="font-semibold">{order.order_number}</span></div>
        <div><span className="text-gray-500">Customer:</span> <span className="font-semibold">{order.customer_name || order.customers?.name}</span></div>
        <div><span className="text-gray-500">Status:</span> <Badge s={order.order_status || order.status} /></div>
        <div><span className="text-gray-500">Date:</span> {fmtDate(order.created_at)}</div>
      </div>
      {loadingItems
        ? <div className="text-center py-4 text-gray-400 text-sm">Loading items...</div>
        : items.length > 0 && (
          <table className="w-full text-sm border rounded-xl overflow-hidden">
            <thead><tr className="bg-gray-50 text-xs text-gray-500"><th className="px-3 py-2 text-left">Product</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Rate</th><th className="px-3 py-2 text-right">Amount</th></tr></thead>
            <tbody>{items.map((i, idx) => (
              <tr key={idx} className="border-t">
                <td className="px-3 py-2">{i.products?.name || i.product_name || '-'}</td>
                <td className="px-3 py-2 text-right">{i.quantity}</td>
                <td className="px-3 py-2 text-right">{cur(i.unit_rate)}</td>
                <td className="px-3 py-2 text-right font-medium">{cur(i.total_amount || i.quantity * i.unit_rate)}</td>
              </tr>
            ))}</tbody>
            <tfoot className="border-t bg-gray-50"><tr><td colSpan={3} className="px-3 py-2 text-right font-bold">Total</td><td className="px-3 py-2 text-right font-bold text-green-600">{cur(order.total_amount || order.total)}</td></tr></tfoot>
          </table>
        )
      }
    </div>
  )
}

// ─── INVOICE FORM ─────────────────────────────────────────────
function InvoiceForm({ data, orders, customers, states, districts, blocks, onSave, onCancel, saving }) {
  const isEdit = !!data?.id
  const [f, setF] = useState(data ? { ...data } : { order_id: '', customer_id: '', subtotal: 0, payment_status: 'pending', invoice_date: new Date().toISOString().slice(0, 10), notes: '', state_id: '', district_id: '', block_id: '' })
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const selOrder = oid => {
    const o = orders.find(x => x.id === oid); if (!o) return
    set('order_id', oid); set('customer_id', o.customer_id); set('subtotal', o.subtotal || o.total_amount || 0)
  }
  const filteredDistricts = districts.filter(d => !f.state_id || d.state_id === f.state_id)
  const filteredBlocks = blocks.filter(b => !f.district_id || b.district_id === f.district_id)
  const cgst = (f.subtotal || 0) * 0.09
  return (
    <div className="space-y-4">
      {!isEdit && <FRow label="Link to Order"><select className={sel} value={f.order_id} onChange={e => selOrder(e.target.value)}><option value="">Select order (optional)...</option>{orders.map(o => <option key={o.id} value={o.id}>{o.order_number} — {o.customer_name || o.customers?.name}</option>)}</select></FRow>}
      {!f.order_id && !isEdit && (
        <FRow label="Customer"><select className={sel} value={f.customer_id} onChange={e => set('customer_id', e.target.value)}>
          <option value="">Select customer...</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></FRow>
      )}
      <div className="grid grid-cols-3 gap-3">
        <FRow label="State"><select className={sel} value={f.state_id||''} onChange={e => { set('state_id', e.target.value); set('district_id', ''); set('block_id', '') }}>
          <option value="">Select...</option>{states.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select></FRow>
        <FRow label="District"><select className={sel} value={f.district_id||''} onChange={e => { set('district_id', e.target.value); set('block_id', '') }}>
          <option value="">Select...</option>{filteredDistricts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select></FRow>
        <FRow label="Block"><select className={sel} value={f.block_id||''} onChange={e => set('block_id', e.target.value)}>
          <option value="">Select...</option>{filteredBlocks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select></FRow>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FRow label="Invoice Date"><input className={inp} type="date" value={f.invoice_date || ''} onChange={e => set('invoice_date', e.target.value)} /></FRow>
        <FRow label="Payment Status"><select className={sel} value={f.payment_status} onChange={e => set('payment_status', e.target.value)}><option value="pending">Pending</option><option value="partial">Partial</option><option value="paid">Paid</option></select></FRow>
      </div>
      {!isEdit && <FRow label="Subtotal (₹)"><input className={inp} type="number" value={f.subtotal} onChange={e => set('subtotal', Number(e.target.value))} /></FRow>}
      {Number(f.subtotal) > 0 && (
        <div className="bg-blue-50 rounded-xl p-4 text-sm space-y-1">
          <div className="flex justify-between"><span>Subtotal</span><span className="font-medium">{cur(f.subtotal)}</span></div>
          <div className="flex justify-between"><span>CGST (9%)</span><span>{cur(cgst)}</span></div>
          <div className="flex justify-between"><span>SGST (9%)</span><span>{cur(cgst)}</span></div>
          <div className="flex justify-between font-bold border-t pt-1 text-base"><span>Total</span><span className="text-blue-700">{cur(Number(f.subtotal) + cgst * 2)}</span></div>
        </div>
      )}
      <FRow label="Notes"><textarea className={inp} rows={2} value={f.notes || ''} onChange={e => set('notes', e.target.value)} /></FRow>
      <div className="flex justify-end gap-3 pt-2">
        <button onClick={onCancel} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Cancel</button>
        <button onClick={() => onSave(f)} disabled={saving} className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-60">{saving ? 'Saving...' : isEdit ? 'Update Invoice' : 'Create Invoice'}</button>
      </div>
    </div>
  )
}

function InvoiceDetail({ invoice, user, onPrint }) {
  const [inv, setInv] = useState(invoice)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingCompany, setEditingCompany] = useState(false)
  const [company, setCompany] = useState(getCompany())
  const [companyDraft, setCompanyDraft] = useState(getCompany())
  const isAdmin = user?.role === 'super_admin' || user?.role === 'state_admin'

  useEffect(() => {
    const load = async () => {
      const rows = await adminFetch('select', 'invoices', null, { qs: `select=*,customers(*),states(name),districts(name),blocks(name)&id=eq.${invoice.id}` })
      const loaded = Array.isArray(rows) && rows[0] ? rows[0] : invoice
      setInv(loaded)
      const orderId = loaded.order_id || invoice.order_id
      if (orderId) {
        const { data: oi } = await supabase.from('order_items').select('*, products(name,hsn_code,product_code,unit)').eq('order_id', orderId)
        setItems((oi || []).map(it => ({ ...it, rate: it.unit_rate, cgst_rate: (it.tax_rate||0)/2, sgst_rate: (it.tax_rate||0)/2 })))
      } else if (loaded.invoice_items) {
        setItems(loaded.invoice_items)
      }
      setLoading(false)
    }
    load()
  }, [invoice.id])

  const saveCompanyEdit = () => { saveCompany(companyDraft); setCompany(companyDraft); setEditingCompany(false) }

  if (loading) return <div className="flex justify-center items-center py-16 text-green-600 font-medium">Loading invoice...</div>
  const cust = inv.customers || {}
  const balance = (inv.total_amount||0) - (inv.paid_amount||0)
  const levelParts = [inv.states?.name, inv.districts?.name, inv.blocks?.name].filter(Boolean)

  return (
    <div className="text-sm border border-green-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-start p-5 border-b-2 border-green-600 bg-green-50">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0">
            <Image src="/logo.png" alt="SOIL" width={150} height={68} style={{objectFit:'contain'}} />
          </div>
          <div>
            <div className="text-xs text-gray-500 mt-1">{company.address}</div>
            <div className="text-xs text-gray-500">GSTIN: {company.gstin} &nbsp;|&nbsp; Ph: {company.phone}</div>
            <div className="text-xs text-gray-500">Email: {company.email} &nbsp;|&nbsp; {company.website}</div>
            {isAdmin && !editingCompany && <button onClick={() => { setCompanyDraft(company); setEditingCompany(true) }} className="mt-1 text-xs text-blue-500 hover:underline">✏ Edit company info</button>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-base font-black text-green-700 border-2 border-green-600 px-3 py-1 rounded-lg inline-block">TAX INVOICE</div>
          <div className="mt-2 text-xs text-gray-600 space-y-0.5">
            <div><span className="font-semibold">Invoice No:</span> {inv.invoice_number}</div>
            <div><span className="font-semibold">Date:</span> {fmtDate(inv.invoice_date||inv.created_at)}</div>
            {inv.due_date && <div><span className="font-semibold">Due Date:</span> {fmtDate(inv.due_date)}</div>}
            {inv.order_id && <div><span className="font-semibold">Order Ref:</span> {inv.order_number || inv.order_id?.slice(0,8)}</div>}
          </div>
        </div>
      </div>
      {/* Company info edit panel */}
      {editingCompany && (
        <div className="px-5 py-3 bg-yellow-50 border-b space-y-2">
          <div className="text-xs font-bold text-yellow-700 mb-2">Edit Company Info (saved locally)</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[['address','Address'],['gstin','GSTIN'],['phone','Phone'],['email','Email'],['website','Website']].map(([k,l]) => (
              <div key={k}><label className="text-gray-500 block mb-0.5">{l}</label>
                <input className="border rounded px-2 py-1 w-full text-xs" value={companyDraft[k]||''} onChange={e => setCompanyDraft(p => ({...p,[k]:e.target.value}))} />
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={saveCompanyEdit} className="px-3 py-1 bg-green-600 text-white rounded text-xs">Save</button>
            <button onClick={() => setEditingCompany(false)} className="px-3 py-1 border rounded text-xs">Cancel</button>
          </div>
        </div>
      )}
      {/* Bill To + Level */}
      <div className="px-5 py-3 bg-gray-50 border-b flex items-start gap-4">
        <div className="flex-1">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Bill To</div>
          <div className="font-bold text-gray-800 text-base">{cust.name || 'N/A'}</div>
          {cust.address && <div className="text-xs text-gray-500 mt-0.5">{cust.address}</div>}
          {cust.gst_number && <div className="text-xs text-gray-500">GSTIN: {cust.gst_number}</div>}
          {cust.phone && <div className="text-xs text-gray-500">Ph: {cust.phone}</div>}
          {cust.email && <div className="text-xs text-gray-500">Email: {cust.email}</div>}
        </div>
        <div className="text-right space-y-1">
          {levelParts.length > 0 && (
            <div className="text-xs text-gray-500 bg-green-50 border border-green-200 rounded px-2 py-1">
              <span className="font-semibold text-green-700">Level: </span>{levelParts.join(' → ')}
            </div>
          )}
          <div><Badge s={inv.payment_status} /></div>
        </div>
      </div>
      {/* Items */}
      {items.length > 0 && (
        <div className="border-b overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="bg-green-50 text-gray-600 font-semibold">
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">Product</th>
              <th className="px-3 py-2 text-left">HSN</th>
              <th className="px-3 py-2 text-center">Qty</th>
              <th className="px-3 py-2 text-right">Rate</th>
              <th className="px-3 py-2 text-center">CGST%</th>
              <th className="px-3 py-2 text-center">SGST%</th>
              <th className="px-3 py-2 text-right">Taxable</th>
              <th className="px-3 py-2 text-right">Total</th>
            </tr></thead>
            <tbody>{items.map((it,i) => (
              <tr key={it.id||i} className={i%2===0?'bg-white':'bg-gray-50'}>
                <td className="px-3 py-2 text-gray-400">{i+1}</td>
                <td className="px-3 py-2 font-medium">{it.products?.name||'-'}<br/><span className="text-gray-400 font-normal">{it.products?.product_code}</span></td>
                <td className="px-3 py-2 text-gray-500">{it.products?.hsn_code||it.hsn_code||'-'}</td>
                <td className="px-3 py-2 text-center">{it.quantity} {it.products?.unit||it.unit||''}</td>
                <td className="px-3 py-2 text-right">{cur(it.rate||it.unit_rate)}</td>
                <td className="px-3 py-2 text-center">{it.cgst_rate||9}%</td>
                <td className="px-3 py-2 text-center">{it.sgst_rate||9}%</td>
                <td className="px-3 py-2 text-right">{cur((it.quantity||0)*(it.rate||it.unit_rate||0))}</td>
                <td className="px-3 py-2 text-right font-semibold">{cur(it.total_amount||(it.quantity||0)*(it.rate||it.unit_rate||0)*(1+(it.tax_rate||0)/100))}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {items.length === 0 && (
        <div className="px-5 py-3 text-xs text-gray-400 border-b italic">No items linked to this invoice. Link an order when creating the invoice to show product details.</div>
      )}
      {/* Summary */}
      <div className="flex gap-4 p-5 border-b">
        <div className="flex-1">
          {inv.notes && <div className="mb-3 bg-gray-50 rounded-lg p-3 text-xs text-gray-600"><span className="font-semibold">Notes: </span>{inv.notes}</div>}
          <div className="border rounded-lg p-3 text-xs">
            <div className="font-semibold text-gray-600 mb-1">Amount in Words:</div>
            <div className="italic text-gray-700">{amtInWords(inv.total_amount||0)}</div>
          </div>
        </div>
        <div className="w-52 text-xs space-y-0.5">
          <div className="flex justify-between py-1 border-b"><span className="text-gray-500">Subtotal</span><span>{cur(inv.subtotal)}</span></div>
          {(inv.discount_amount>0) && <div className="flex justify-between py-1 border-b text-red-600"><span>Discount</span><span>- {cur(inv.discount_amount)}</span></div>}
          <div className="flex justify-between py-1 border-b"><span className="text-gray-500">CGST (9%)</span><span>{cur(inv.cgst_amount)}</span></div>
          <div className="flex justify-between py-1 border-b"><span className="text-gray-500">SGST (9%)</span><span>{cur(inv.sgst_amount)}</span></div>
          {(inv.igst_amount>0) && <div className="flex justify-between py-1 border-b"><span className="text-gray-500">IGST</span><span>{cur(inv.igst_amount)}</span></div>}
          <div className="flex justify-between py-2 font-bold text-sm border-t-2 border-gray-700"><span>Grand Total</span><span className="text-green-700">{cur(inv.total_amount)}</span></div>
          {(inv.paid_amount>0) && <div className="flex justify-between py-1 text-green-600"><span>Paid</span><span>{cur(inv.paid_amount)}</span></div>}
          {(balance>0.5) && <div className="flex justify-between py-1 font-semibold text-red-600"><span>Balance Due</span><span>{cur(balance)}</span></div>}
        </div>
      </div>
      {/* Footer */}
      <div className="flex justify-between items-end px-5 py-4 bg-gray-50 text-xs text-gray-500">
        <div>
          <div className="font-semibold text-gray-600 mb-1">Terms & Conditions:</div>
          <div>• Goods once sold will not be taken back.</div>
          <div>• Subject to Muzaffarpur jurisdiction. &nbsp; E. &amp; O.E.</div>
        </div>
        <div className="text-right">
          <div className="font-semibold text-gray-700">For Sheevar Organic Industrial Ltd.</div>
          <div className="mt-8 border-t border-gray-400 pt-1 text-gray-500">Authorized Signatory</div>
        </div>
      </div>
      {/* Print Button */}
      <div className="px-5 pb-5 pt-3 flex justify-end">
        <button onClick={onPrint} className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
          Print Invoice
        </button>
      </div>
    </div>
  )
}

// ─── PAYMENT FORM ─────────────────────────────────────────────
function PaymentForm({ invoices, customers, onSave, onCancel, saving }) {
  const [f, setF] = useState({ invoice_id: '', customer_id: '', amount: '', payment_mode: 'cash', payment_date: new Date().toISOString().slice(0, 10), reference_number: '' })
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const selInv = id => { const i = invoices.find(x => x.id === id); if (i) { set('invoice_id', id); set('customer_id', i.customer_id || ''); set('amount', (i.total_amount || 0) - (i.paid_amount || 0)) } }
  return (
    <div className="space-y-4">
      <FRow label="Invoice" required><select className={sel} value={f.invoice_id} onChange={e => selInv(e.target.value)}>
        <option value="">Select invoice...</option>{invoices.filter(i => i.payment_status !== 'paid').map(i => <option key={i.id} value={i.id}>{i.invoice_number} — Due: {cur((i.total_amount || 0) - (i.paid_amount || 0))}</option>)}
      </select></FRow>
      <div className="grid grid-cols-2 gap-4">
        <FRow label="Amount (₹)" required><input className={inp} type="number" value={f.amount} onChange={e => set('amount', e.target.value)} /></FRow>
        <FRow label="Payment Date"><input className={inp} type="date" value={f.payment_date} onChange={e => set('payment_date', e.target.value)} /></FRow>
        <FRow label="Payment Mode"><select className={sel} value={f.payment_mode} onChange={e => set('payment_mode', e.target.value)}>
          {['cash', 'bank_transfer', 'cheque', 'upi'].map(m => <option key={m} value={m}>{m.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
        </select></FRow>
        <FRow label="Reference #"><input className={inp} value={f.reference_number} onChange={e => set('reference_number', e.target.value)} /></FRow>
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button onClick={onCancel} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Cancel</button>
        <button onClick={() => onSave(f)} disabled={saving} className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-60">{saving ? 'Saving...' : 'Record Payment'}</button>
      </div>
    </div>
  )
}

// ─── EXECUTIVE FORM ───────────────────────────────────────────
const ROLE_NEEDS_LOC = {
  state_admin: ['state'], district_admin: ['state', 'district'],
  block_admin: ['state', 'district', 'block'], marketing_executive: ['state', 'district', 'block'],
  retailer: ['state', 'district', 'block'], accountant: [], super_admin: [],
}

function SectionHead({ title, color = 'green' }) {
  const cls = { green: 'bg-green-50 text-green-700 border-green-200', blue: 'bg-blue-50 text-blue-700 border-blue-200', amber: 'bg-amber-50 text-amber-700 border-amber-200', purple: 'bg-purple-50 text-purple-700 border-purple-200' }
  return <div className={`text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg border ${cls[color] || cls.green}`}>{title}</div>
}

function UserCreateForm({ states, districts, blocks, panchayats, villages, onSave, onCancel, saving }) {
  const [f, setF] = useState({ first_name: '', last_name: '', email: '', phone: '', password: '', role: 'marketing_executive', employee_id: '', joining_date: new Date().toISOString().slice(0,10), address: '', aadhaar_no: '', pan_no: '', emg1_name: '', emg1_rel: '', emg2_name: '', emg2_rel: '', state_id: '', district_id: '', block_id: '', panchayat_id: '', village_id: '', photoBase64: null, photoFileName: null, photoContentType: null })
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const needs = ROLE_NEEDS_LOC[f.role] || []
  const filtDist = districts.filter(d => !f.state_id || d.state_id === f.state_id)
  const filtBlocks = blocks.filter(b => !f.district_id || b.district_id === f.district_id)
  const filtPanch = panchayats.filter(p => !f.block_id || p.block_id === f.block_id)
  const filtVil = villages.filter(v => !f.panchayat_id || v.gram_panchayat_id === f.panchayat_id)
  const [photoPreview, setPhotoPreview] = useState(null)
  const handlePhoto = e => {
    const file = e.target.files[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const dataUrl = ev.target.result
      setPhotoPreview(dataUrl)
      const base64 = dataUrl.split(',')[1]
      setF(p => ({ ...p, photoBase64: base64, photoFileName: file.name, photoContentType: file.type }))
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="space-y-5 max-h-[75vh] overflow-y-auto pr-1">
      {/* Section 1: Basic Info */}
      <SectionHead title="Basic Information" color="green" />
      <div className="grid grid-cols-2 gap-4">
        <FRow label="First Name" required><input className={inp} value={f.first_name} onChange={e => set('first_name', e.target.value)} /></FRow>
        <FRow label="Last Name"><input className={inp} value={f.last_name} onChange={e => set('last_name', e.target.value)} /></FRow>
        <FRow label="Email" required><input className={inp} type="email" value={f.email} onChange={e => set('email', e.target.value)} /></FRow>
        <FRow label="Phone"><input className={inp} type="tel" value={f.phone} onChange={e => set('phone', e.target.value)} /></FRow>
        <FRow label="Password" required><input className={inp} type="password" placeholder="Temporary password" value={f.password} onChange={e => set('password', e.target.value)} /></FRow>
        <FRow label="Role" required><select className={sel} value={f.role} onChange={e => setF(p => ({ ...p, role: e.target.value, state_id: '', district_id: '', block_id: '', panchayat_id: '', village_id: '' }))}>
          {[['state_admin','State Admin'],['district_admin','District Admin'],['block_admin','Block Admin'],['marketing_executive','Marketing Executive'],['accountant','Accountant'],['retailer','Retailer']].map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </select></FRow>
        <FRow label="Employee ID"><input className={inp} value={f.employee_id} onChange={e => set('employee_id', e.target.value)} /></FRow>
        <FRow label="Joining Date"><input className={inp} type="date" value={f.joining_date} onChange={e => set('joining_date', e.target.value)} /></FRow>
      </div>

      {/* Section 2: Personal Details */}
      <SectionHead title="Personal Details" color="blue" />
      <FRow label="Address"><textarea className={inp} rows={2} value={f.address} onChange={e => set('address', e.target.value)} placeholder="Full residential address" /></FRow>
      <div className="grid grid-cols-2 gap-4">
        <FRow label="Aadhaar Number"><input className={inp} maxLength={12} value={f.aadhaar_no} onChange={e => set('aadhaar_no', e.target.value.replace(/\D/g,''))} placeholder="12-digit Aadhaar" /></FRow>
        <FRow label="PAN Number"><input className={inp} maxLength={10} value={f.pan_no} onChange={e => set('pan_no', e.target.value.toUpperCase())} placeholder="ABCDE1234F" /></FRow>
      </div>

      {/* Section 3: Emergency Contacts */}
      <SectionHead title="Emergency Contacts" color="amber" />
      <div className="grid grid-cols-2 gap-4">
        <FRow label="Contact 1 — Name"><input className={inp} value={f.emg1_name} onChange={e => set('emg1_name', e.target.value)} /></FRow>
        <FRow label="Contact 1 — Relationship"><input className={inp} value={f.emg1_rel} onChange={e => set('emg1_rel', e.target.value)} placeholder="e.g. Father, Spouse" /></FRow>
        <FRow label="Contact 2 — Name"><input className={inp} value={f.emg2_name} onChange={e => set('emg2_name', e.target.value)} /></FRow>
        <FRow label="Contact 2 — Relationship"><input className={inp} value={f.emg2_rel} onChange={e => set('emg2_rel', e.target.value)} placeholder="e.g. Mother, Brother" /></FRow>
      </div>

      {/* Section 4: Working Area */}
      <SectionHead title="Working Area" color="purple" />
      <div className="grid grid-cols-2 gap-4">
        <FRow label="State"><select className={sel} value={f.state_id} onChange={e => setF(p => ({ ...p, state_id: e.target.value, district_id: '', block_id: '', panchayat_id: '', village_id: '' }))}>
          <option value="">Select State...</option>{states.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select></FRow>
        <FRow label="District"><select className={sel} value={f.district_id} onChange={e => setF(p => ({ ...p, district_id: e.target.value, block_id: '', panchayat_id: '', village_id: '' }))}>
          <option value="">Select District...</option>{filtDist.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select></FRow>
        <FRow label="Block"><select className={sel} value={f.block_id} onChange={e => setF(p => ({ ...p, block_id: e.target.value, panchayat_id: '', village_id: '' }))}>
          <option value="">Select Block...</option>{filtBlocks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select></FRow>
        <FRow label="Gram Panchayat"><select className={sel} value={f.panchayat_id} onChange={e => setF(p => ({ ...p, panchayat_id: e.target.value, village_id: '' }))}>
          <option value="">Select Panchayat...</option>{filtPanch.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select></FRow>
        <FRow label="Village"><select className={sel} value={f.village_id} onChange={e => set('village_id', e.target.value)}>
          <option value="">Select Village...</option>{filtVil.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select></FRow>
      </div>

      {/* Section 5: Photo */}
      <SectionHead title="ID Photo" color="green" />
      <div className="flex items-start gap-4">
        <div className="flex-1">
          <label className="block text-xs text-gray-600 mb-1">Upload passport/ID-size photo</label>
          <input type="file" accept="image/*" onChange={handlePhoto} className="block w-full text-xs text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:text-xs file:font-medium file:bg-green-50 file:text-green-700 hover:file:bg-green-100" />
          <p className="text-xs text-gray-400 mt-1">JPG/PNG, max 2MB recommended</p>
        </div>
        {photoPreview && (
          <div className="w-20 h-24 border-2 border-green-300 rounded-lg overflow-hidden flex-shrink-0">
            <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 pt-2 border-t sticky bottom-0 bg-white pb-1">
        <button onClick={onCancel} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Cancel</button>
        <button onClick={() => onSave(f)} disabled={saving} className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-60">{saving ? 'Creating...' : 'Create User'}</button>
      </div>
    </div>
  )
}

// ─── LOCATION FORM ────────────────────────────────────────────
function LocationForm({ locType, fields, onSave, onCancel }) {
  const [f, setF] = useState({})
  return (
    <div className="space-y-4">
      {fields?.map(field => (
        <FRow key={field.n} label={field.l}>
          {field.type === 'select'
            ? <select className={sel} value={f[field.n] || ''} onChange={e => setF(p => ({ ...p, [field.n]: e.target.value }))}><option value="">Select...</option>{field.opts?.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
            : <input className={inp} value={f[field.n] || ''} onChange={e => setF(p => ({ ...p, [field.n]: e.target.value }))} />}
        </FRow>
      ))}
      <div className="flex justify-end gap-3 pt-2">
        <button onClick={onCancel} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Cancel</button>
        <button onClick={() => onSave(locType, f)} className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">Add</button>
      </div>
    </div>
  )
}
