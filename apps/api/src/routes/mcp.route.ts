import type { FastifyInstance } from 'fastify'
import { validateApiKey } from '../services/mcp.service.js'
import { isJwt, validateMcpJwt, getOAuthScope, getOAuthAudience, getOAuthIssuer } from '../services/oauth.service.js'
import { search } from '../services/search.service.js'
import { getPropertyDetail } from '../services/static.service.js'
import { fetchPropertyStatic, fetchHotelList } from '../adapters/hyperguest/static.js'
import { prisma } from '../db/client.js'
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'
import { getEffectiveExternalIBEConfig, buildExternalUrl } from '../services/external-ibe.service.js'
import { resolveExternalBookingUrl } from '../services/external-ibe-scraper.service.js'

const WIDGET_URI            = 'hotel://widget/room-results'
const PROPERTY_LIST_URI     = 'hotel://widget/property-list'
const PROPERTY_DETAIL_URI   = 'hotel://widget/property-detail'

const WIDGET_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Room Availability</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px;
      color: #111;
      background: #fff;
      padding: 12px;
    }

    #app { display: flex; flex-direction: column; gap: 10px; }

    .status {
      color: #888;
      font-size: 13px;
      text-align: center;
      padding: 24px 0;
    }

    .card {
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      overflow: hidden;
      transition: box-shadow .15s;
    }
    .card:hover { box-shadow: 0 2px 12px rgba(0,0,0,.08); }

    .card-body {
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .room-name {
      font-size: 15px;
      font-weight: 600;
      color: #111;
    }

    .room-meta {
      font-size: 12px;
      color: #6b7280;
      margin-top: 2px;
    }

    .rates { display: flex; flex-direction: column; gap: 4px; }

    .rate-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13px;
      color: #374151;
    }
    .rate-name { color: #6b7280; }
    .rate-amount { font-weight: 600; color: #111; }

    .card-footer {
      border-top: 1px solid #f3f4f6;
      padding: 10px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .lowest-price {
      font-size: 13px;
      color: #6b7280;
    }
    .lowest-price strong {
      font-size: 16px;
      font-weight: 700;
      color: #111;
    }

    .book-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: #2563eb;
      color: #fff;
      font-size: 13px;
      font-weight: 600;
      padding: 8px 18px;
      border-radius: 999px;
      text-decoration: none;
      border: none;
      cursor: pointer;
      transition: background .15s;
      white-space: nowrap;
    }
    .book-btn:hover { background: #1d4ed8; }

    .avail-badge {
      display: inline-block;
      font-size: 11px;
      font-weight: 500;
      color: #15803d;
      background: #dcfce7;
      border-radius: 999px;
      padding: 2px 8px;
    }
    .avail-badge.low {
      color: #b45309;
      background: #fef3c7;
    }
  </style>
</head>
<body>
  <div id="app"><p class="status">Loading availability…</p></div>

  <script>
    let toolInput = null

    window.addEventListener('message', (event) => {
      const msg = event.data
      if (!msg || msg.jsonrpc !== '2.0') return

      if (msg.method === 'ui/initialize') {
        reply(event, msg.id, {})
        return
      }

      if (msg.method === 'ui/notifications/tool-input') {
        toolInput = msg.params?.input ?? {}
        return
      }

      if (msg.method === 'ui/notifications/tool-result') {
        const result = msg.params?.result ?? {}
        const meta   = result._meta ?? {}
        const rooms  = meta.rooms ?? result.structuredContent?.rooms ?? []
        render(rooms, meta)
      }
    })

    function reply(event, id, result) {
      const target = event.source ?? window.parent
      const origin = event.origin && event.origin !== 'null' ? event.origin : '*'
      target.postMessage({ jsonrpc: '2.0', id, result }, origin)
    }

    function fmt(amount, currency) {
      try {
        return new Intl.NumberFormat('en-US', {
          style: 'currency', currency,
          minimumFractionDigits: 0, maximumFractionDigits: 0,
        }).format(amount)
      } catch {
        return currency + ' ' + Math.round(amount)
      }
    }

    function buildExternalUrl(template, params) {
      var enriched = Object.assign({}, params)
      if (typeof params.checkIn === 'string' && params.checkIn) {
        enriched.checkInMs = new Date(params.checkIn + 'T00:00:00').getTime()
        var ciParts = params.checkIn.split('-')
        if (ciParts.length === 3) enriched.checkInMDY = ciParts[1] + '/' + ciParts[2] + '/' + ciParts[0]
      }
      if (typeof params.checkOut === 'string' && params.checkOut) {
        enriched.checkOutMs = new Date(params.checkOut + 'T00:00:00').getTime()
        var coParts = params.checkOut.split('-')
        if (coParts.length === 3) enriched.checkOutMDY = coParts[1] + '/' + coParts[2] + '/' + coParts[0]
      }
      var result = template
      for (var key in enriched) {
        var val = enriched[key]
        if (val !== null && val !== undefined) {
          result = result.split('{' + key + '}').join(String(val))
        }
      }
      var qIdx = result.indexOf('?')
      if (qIdx === -1) return result
      var base = result.slice(0, qIdx)
      var kept = result.slice(qIdx + 1).split('&').filter(function(pair) { return !/\{[^}]+\}/.test(pair) })
      return kept.length > 0 ? base + '?' + kept.join('&') : base
    }

    function directBookingUrl(room, rate, meta) {
      var extCfg = meta.externalIBEConfig
      if (extCfg && extCfg.bookingTemplate && !extCfg.needsSolutionId) {
        return buildExternalUrl(extCfg.bookingTemplate, {
          hotelId:         meta.propertyId,
          externalHotelId: extCfg.externalHotelId,
          checkIn:         meta.checkIn  ?? '',
          checkOut:        meta.checkOut ?? '',
          adults:          meta.adults ?? 2,
          rooms:           1,
          roomId:          room.roomId,
          ratePlanId:      rate.ratePlanId,
        })
      }
      if (extCfg && extCfg.needsSolutionId) return null
      if (!meta.webBaseUrl || !meta.propertyId) return null
      var p = new URLSearchParams({
        hotelId:            String(meta.propertyId),
        checkIn:            meta.checkIn  ?? '',
        checkOut:           meta.checkOut ?? '',
        'rooms[0][adults]': String(meta.adults ?? 2),
        roomId:             String(room.roomId),
        ratePlanId:         String(rate.ratePlanId),
        searchId:           meta.searchId ?? '',
      })
      return meta.webBaseUrl + '/booking?' + p
    }

    function resolveAndOpen(btn, room, meta) {
      var extCfg = meta.externalIBEConfig
      if (!extCfg || !extCfg.resolveEndpoint) return
      btn.disabled = true
      btn.textContent = 'Searching...'
      fetch(extCfg.resolveEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId:  meta.propertyId,
          checkIn:     meta.checkIn,
          checkOut:    meta.checkOut,
          adults:      meta.adults ?? 2,
          roomName:    room.roomName,
          lowestPrice: room.lowestRate,
        }),
      })
      .then(function(r) {
        if (!r.ok) throw new Error('resolve failed')
        return r.json()
      })
      .then(function(data) {
        if (!data.bookingUrl) throw new Error('no bookingUrl')
        window.open(data.bookingUrl, '_blank', 'noopener,noreferrer')
      })
      .catch(function() {
        if (extCfg.searchTemplate) {
          var fallback = buildExternalUrl(extCfg.searchTemplate, {
            externalHotelId: extCfg.externalHotelId,
            checkIn:  meta.checkIn  ?? '',
            checkOut: meta.checkOut ?? '',
            adults:   meta.adults ?? 2,
            rooms:    1,
          })
          window.open(fallback, '_blank', 'noopener,noreferrer')
        }
      })
      .finally(function() { btn.disabled = false; btn.textContent = 'Book now' })
    }

    function render(rooms, meta) {
      const app = document.getElementById('app')
      if (!rooms.length) {
        app.innerHTML = '<p class="status">No rooms available for your selection.</p>'
        return
      }
      const currency = meta.currency ?? 'USD'
      const extCfg = meta.externalIBEConfig
      const needsResolve = extCfg && extCfg.needsSolutionId

      app.innerHTML = rooms.map(function(room, idx) {
        const bestRate = room.rates && room.rates[0]
        const directUrl = bestRate ? directBookingUrl(room, bestRate, meta) : null
        const low = room.availableCount <= 3
        const availLabel = low ? 'Only ' + room.availableCount + ' left' : room.availableCount + ' available'
        const ratesHtml = (room.rates ?? []).slice(0, 3).map(function(r) {
          return '<div class="rate-row"><span class="rate-name">' + r.ratePlanName + (r.boardType ? ' &middot; ' + r.boardType : '') + '</span><span class="rate-amount">' + fmt(r.amount, currency) + '</span></div>'
        }).join('')
        var btnHtml
        if (bestRate && (directUrl || needsResolve)) {
          btnHtml = needsResolve
            ? '<button class="book-btn" data-room-idx="' + idx + '">Book now</button>'
            : '<a href="' + directUrl + '" target="_blank" rel="noopener noreferrer" class="book-btn">Book now</a>'
        } else {
          btnHtml = '<span style="font-size:12px;color:#6b7280">Contact hotel</span>'
        }
        return '<div class="card"><div class="card-body"><div><p class="room-name">' + room.roomName + '</p><p class="room-meta"><span class="avail-badge' + (low ? ' low' : '') + '">' + availLabel + '</span></p></div><div class="rates">' + ratesHtml + '</div></div><div class="card-footer"><div class="lowest-price">From <strong>' + fmt(room.lowestRate, currency) + '</strong><br><span style="font-size:11px">per night</span></div>' + btnHtml + '</div></div>'
      }).join('')

      if (extCfg && extCfg.needsSolutionId) {
        app.querySelectorAll('button.book-btn[data-room-idx]').forEach(function(btn) {
          var idx = parseInt(btn.getAttribute('data-room-idx') ?? '0', 10)
          var room = rooms[idx]
          if (room) btn.addEventListener('click', function() { resolveAndOpen(btn, room, meta) })
        })
      }
    }
  <\/script>
</body>
</html>`

const PROPERTY_LIST_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Hotels</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px;
      color: #111;
      background: #fff;
      padding: 12px;
    }
    .status { color: #888; font-size: 13px; text-align: center; padding: 24px 0; }
    .header { margin-bottom: 10px; }
    .header h2 { font-size: 16px; font-weight: 700; color: #111; }
    .header .meta { font-size: 12px; color: #6b7280; margin-top: 2px; }
    .carousel {
      display: flex; gap: 12px;
      overflow-x: auto; padding-bottom: 8px;
      scroll-snap-type: x mandatory;
      -webkit-overflow-scrolling: touch;
    }
    .carousel::-webkit-scrollbar { height: 4px; }
    .carousel::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 2px; }
    .card {
      flex: 0 0 210px;
      border: 1px solid #e5e7eb; border-radius: 12px;
      overflow: hidden; scroll-snap-align: start;
      display: flex; flex-direction: column;
      transition: box-shadow .15s;
    }
    .card:hover { box-shadow: 0 4px 16px rgba(0,0,0,.10); }
    .card-img { width: 100%; height: 128px; object-fit: cover; background: #f3f4f6; display: block; }
    .card-img-ph {
      width: 100%; height: 128px;
      background: linear-gradient(135deg,#f3f4f6,#e5e7eb);
      display: flex; align-items: center; justify-content: center;
      font-size: 36px; color: #9ca3af;
    }
    .card-body { padding: 10px 12px; display: flex; flex-direction: column; gap: 4px; flex: 1; }
    .card-name {
      font-size: 13px; font-weight: 600; color: #111; line-height: 1.3;
      display: -webkit-box; -webkit-line-clamp: 2;
      -webkit-box-orient: vertical; overflow: hidden;
    }
    .card-meta { display: flex; align-items: center; gap: 5px; font-size: 11px; color: #6b7280; flex-wrap: wrap; }
    .stars { color: #f59e0b; letter-spacing: -1px; }
    .card-footer { padding: 8px 12px; border-top: 1px solid #f3f4f6; display: flex; gap: 6px; }
    .btn {
      flex: 1; display: inline-flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 600; padding: 6px 4px;
      border-radius: 8px; text-decoration: none; transition: background .15s; white-space: nowrap;
    }
    .btn-primary { background: #2563eb; color: #fff; }
    .btn-primary:hover { background: #1d4ed8; }
    .btn-secondary { background: #f3f4f6; color: #374151; }
    .btn-secondary:hover { background: #e5e7eb; }
  </style>
</head>
<body>
  <div id="app"><p class="status">Loading hotels…</p></div>
  <script>
    window.addEventListener('message', function(event) {
      var msg = event.data
      if (!msg || msg.jsonrpc !== '2.0') return
      if (msg.method === 'ui/initialize') {
        var t = event.source || window.parent
        var o = event.origin && event.origin !== 'null' ? event.origin : '*'
        t.postMessage({ jsonrpc: '2.0', id: msg.id, result: {} }, o)
        return
      }
      if (msg.method === 'ui/notifications/tool-result') {
        var result = (msg.params && msg.params.result) || {}
        var meta = result._meta || {}
        var props = meta.properties || (result.structuredContent && result.structuredContent.properties) || []
        var note  = meta.note || (result.structuredContent && result.structuredContent.note)
        var total = meta.total || (result.structuredContent && result.structuredContent.total) || props.length
        render(props, total, note)
      }
    })

    function esc(str) {
      return String(str == null ? '' : str).replace(/[&<>"']/g, function(c) {
        return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]
      })
    }

    function stars(n) {
      if (!n) return ''
      var s = ''; for (var i = 0; i < Math.min(5, Math.round(n)); i++) s += '★'
      return s
    }

    function render(props, total, note) {
      var app = document.getElementById('app')
      if (!props.length) { app.innerHTML = '<p class="status">No hotels found.</p>'; return }

      var shown = props.length
      var hdr = '<div class="header"><h2>' + shown + (total > shown ? ' of ' + total : '') + ' Hotels</h2>' +
        (note ? '<p class="meta">' + esc(note) + '</p>' : '') + '</div>'

      var cards = props.map(function(p) {
        var imgHtml = (p.images && p.images[0])
          ? '<img class="card-img" src="' + esc(p.images[0]) + '" alt="' + esc(p.name) + '" loading="lazy">'
          : '<div class="card-img-ph">🏨</div>'
        var st = stars(p.stars)
        var city = p.city ? esc(p.city) + (p.country ? ', ' + esc(p.country) : '') : ''
        var bookBtn = p.bookUrl
          ? '<a href="' + esc(p.bookUrl) + '" target="_blank" rel="noopener noreferrer" class="btn btn-primary">Book</a>'
          : ''
        var detailBtn = p.detailUrl
          ? '<a href="' + esc(p.detailUrl) + '" target="_blank" rel="noopener noreferrer" class="btn btn-secondary">Details</a>'
          : ''
        return '<div class="card">' + imgHtml +
          '<div class="card-body"><p class="card-name">' + esc(p.name) + '</p>' +
          '<div class="card-meta">' + (st ? '<span class="stars">' + st + '</span>' : '') + (city ? '<span>' + city + '</span>' : '') + '</div>' +
          '</div><div class="card-footer">' + bookBtn + detailBtn + '</div></div>'
      }).join('')

      app.innerHTML = hdr + '<div class="carousel">' + cards + '</div>'
    }
  <\/script>
</body>
</html>`

const PROPERTY_DETAIL_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Hotel Details</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px; color: #111; background: #fff;
    }
    .status { color: #888; font-size: 13px; text-align: center; padding: 24px 0; }

    /* Photo strip */
    .photos { display: flex; gap: 4px; overflow-x: auto; scroll-snap-type: x mandatory; height: 200px; background: #f3f4f6; }
    .photos::-webkit-scrollbar { display: none; }
    .photos img {
      flex: 0 0 auto; height: 100%; width: auto; max-width: 320px;
      object-fit: cover; scroll-snap-align: start; display: block;
    }
    .photos-ph {
      width: 100%; height: 200px; background: linear-gradient(135deg,#f3f4f6,#e5e7eb);
      display: flex; align-items: center; justify-content: center;
      font-size: 48px; color: #9ca3af;
    }

    /* Content */
    .content { padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }

    .hotel-name { font-size: 18px; font-weight: 700; color: #111; line-height: 1.2; }

    .meta-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .stars { color: #f59e0b; font-size: 15px; letter-spacing: -1px; }
    .badge {
      font-size: 11px; font-weight: 500; background: #f3f4f6;
      color: #374151; border-radius: 6px; padding: 2px 8px;
    }

    .location { font-size: 13px; color: #6b7280; display: flex; align-items: flex-start; gap: 5px; }
    .location-icon { flex-shrink: 0; margin-top: 1px; }

    .divider { border: none; border-top: 1px solid #f3f4f6; }

    .tagline { font-size: 14px; font-weight: 600; color: #374151; font-style: italic; }
    .desc {
      font-size: 13px; color: #4b5563; line-height: 1.6;
      display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; overflow: hidden;
    }

    .actions { display: flex; gap: 8px; padding-top: 2px; }
    .btn {
      flex: 1; display: inline-flex; align-items: center; justify-content: center;
      font-size: 13px; font-weight: 600; padding: 10px 12px;
      border-radius: 10px; text-decoration: none; transition: background .15s;
    }
    .btn-primary { background: #2563eb; color: #fff; }
    .btn-primary:hover { background: #1d4ed8; }
    .btn-secondary { background: #f3f4f6; color: #374151; }
    .btn-secondary:hover { background: #e5e7eb; }
  </style>
</head>
<body>
  <div id="app"><p class="status">Loading hotel…</p></div>
  <script>
    window.addEventListener('message', function(event) {
      var msg = event.data
      if (!msg || msg.jsonrpc !== '2.0') return
      if (msg.method === 'ui/initialize') {
        var t = event.source || window.parent
        var o = event.origin && event.origin !== 'null' ? event.origin : '*'
        t.postMessage({ jsonrpc: '2.0', id: msg.id, result: {} }, o)
        return
      }
      if (msg.method === 'ui/notifications/tool-result') {
        var result = (msg.params && msg.params.result) || {}
        var meta = result._meta || {}
        var h = meta.hotel || (result.structuredContent && result.structuredContent.hotel)
        if (h) render(h)
      }
    })

    function esc(str) {
      return String(str == null ? '' : str).replace(/[&<>"']/g, function(c) {
        return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]
      })
    }

    function stars(n) {
      if (!n) return ''
      var s = ''; for (var i = 0; i < Math.min(5, Math.round(n)); i++) s += '★'
      return s
    }

    function render(h) {
      var app = document.getElementById('app')

      var photosHtml = (h.images && h.images.length)
        ? '<div class="photos">' + h.images.map(function(u) {
            return '<img src="' + esc(u) + '" alt="' + esc(h.name) + '" loading="lazy">'
          }).join('') + '</div>'
        : '<div class="photos-ph">🏨</div>'

      var st = stars(h.starRating)
      var loc = [h.address, h.city, h.country].filter(Boolean).map(esc).join(', ')

      var bookBtn = h.bookUrl
        ? '<a href="' + esc(h.bookUrl) + '" target="_blank" rel="noopener noreferrer" class="btn btn-primary">Book now</a>' : ''
      var detailBtn = h.detailUrl
        ? '<a href="' + esc(h.detailUrl) + '" target="_blank" rel="noopener noreferrer" class="btn btn-secondary">View page</a>' : ''

      app.innerHTML = photosHtml +
        '<div class="content">' +
          '<p class="hotel-name">' + esc(h.name) + '</p>' +
          '<div class="meta-row">' +
            (st ? '<span class="stars">' + st + '</span>' : '') +
            (h.starRating ? '<span class="badge">' + h.starRating + '-star</span>' : '') +
          '</div>' +
          (loc ? '<div class="location"><span class="location-icon">📍</span><span>' + loc + '</span></div>' : '') +
          '<hr class="divider">' +
          (h.tagline ? '<p class="tagline">"' + esc(h.tagline) + '"</p>' : '') +
          (h.description ? '<p class="desc">' + esc(h.description) + '</p>' : '') +
          '<div class="actions">' + bookBtn + detailBtn + '</div>' +
        '</div>'
    }
  <\/script>
</body>
</html>`

const PROTOCOL_VERSION = '2024-11-05'

const MCP_TOOLS = [
  {
    name: 'list_properties',
    description: 'List hotels available in this connection. Returns up to 20 at a time — use query to filter by name/city and offset to paginate. Always call this first on chain connections to discover propertyId values.',
    inputSchema: {
      type: 'object',
      properties: {
        query:  { type: 'string',  description: 'Filter by hotel name or city (case-insensitive)' },
        limit:  { type: 'integer', description: 'Max results to return (default 20, max 50)' },
        offset: { type: 'integer', description: 'Skip N results for pagination (default 0)' },
      },
    },
  },
  {
    name: 'search_availability',
    description: 'Search for available rooms at a hotel for given dates and guests. For chain connections you must supply propertyId (use list_properties to discover IDs). STOP after calling this — present all rooms and rates to the user, then explicitly ask which room and rate they want. Do NOT call create_booking_link until the user has answered.',
    inputSchema: {
      type: 'object',
      properties: {
        checkIn:    { type: 'string',  description: 'Check-in date (YYYY-MM-DD)' },
        checkOut:   { type: 'string',  description: 'Check-out date (YYYY-MM-DD)' },
        adults:     { type: 'integer', description: 'Number of adults', default: 2 },
        children:   { type: 'integer', description: 'Number of children', default: 0 },
        propertyId: { type: 'integer', description: 'Property ID — required for chain connections' },
      },
      required: ['checkIn', 'checkOut'],
    },
  },
  {
    name: 'get_property_info',
    description: 'Get hotel name, location, star rating, facilities and description. For chain connections you must supply propertyId.',
    inputSchema: {
      type: 'object',
      properties: {
        propertyId: { type: 'integer', description: 'Property ID — required for chain connections' },
      },
    },
  },
  {
    name: 'get_room_details',
    description: 'Get detailed information about a specific room type.',
    inputSchema: {
      type: 'object',
      properties: {
        roomId:     { type: 'integer', description: 'Room ID from search_availability results' },
        propertyId: { type: 'integer', description: 'Property ID — required for chain connections' },
      },
      required: ['roomId'],
    },
  },
  {
    name: 'create_booking_link',
    description: 'Generate a direct booking URL for the guest to complete payment on the hotel website. ONLY call this after the user has explicitly named which room they want to book. roomId and ratePlanId MUST come from the user\'s selection — never infer or assume them from search results. Never call this in the same turn as search_availability.',
    inputSchema: {
      type: 'object',
      properties: {
        propertyId: { type: 'integer', description: 'Property ID' },
        checkIn:    { type: 'string',  description: 'Check-in date (YYYY-MM-DD)' },
        checkOut:   { type: 'string',  description: 'Check-out date (YYYY-MM-DD)' },
        adults:     { type: 'integer', description: 'Number of adults', default: 2 },
        children:   { type: 'integer', description: 'Number of children', default: 0 },
        roomId:     { type: 'integer', description: 'Room ID to pre-select — from search_availability results' },
        ratePlanId: { type: 'integer', description: 'Rate plan ID to pre-select — from search_availability results' },
        roomName:   { type: 'string',  description: 'Room name as returned by search_availability — used to match the correct offer on 2-stage external booking engines' },
        searchId:   { type: 'string',  description: 'Search ID from search_availability (optional)' },
      },
      required: ['propertyId', 'checkIn', 'checkOut'],
    },
  },
]

// ── SSE session store ─────────────────────────────────────────────────────────
interface SseSession {
  write: (data: string) => void
  end: () => void
  defaultPropertyId: number | null
  orgId: number | null
  orgSlug: string | null
}
const sseSessions = new Map<string, SseSession>()

// ── Helpers ───────────────────────────────────────────────────────────────────

function mcpResult(content: string) {
  return { content: [{ type: 'text', text: content }] }
}

function mcpError(message: string) {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true }
}

async function resolveDefaultProperty(scope: Awaited<ReturnType<typeof validateApiKey>>): Promise<number | null> {
  if (!scope) return null
  if (scope.kind === 'property') return scope.propertyId
  const first = await prisma.property.findFirst({
    where: { organizationId: scope.orgId, status: 'active' },
    orderBy: { propertyId: 'asc' },
    select: { propertyId: true },
  })
  return first?.propertyId ?? null
}

function proxyImage(url: string): string {
  return `${env.WEB_BASE_URL}/api/v1/public/image-proxy?url=${encodeURIComponent(url)}`
}

function orgUrl(orgSlug: string | null): string {
  if (!orgSlug) return env.WEB_BASE_URL
  const base = env.WEB_BASE_URL.replace(/^https?:\/\//, '').replace(/^www\./, '')
  return `https://${orgSlug}.${base}`
}

async function handleToolCall(
  toolName: string,
  args: Record<string, unknown>,
  defaultPropertyId: number | null,
  orgId: number | null,
  orgSlug: string | null,
): Promise<{ content: { type: string; text: string }[]; structuredContent?: unknown; _meta?: unknown; isError?: boolean }> {
  const pid = (args['propertyId'] as number | undefined) ?? defaultPropertyId ?? 0

  if (toolName === 'list_properties') {
    const baseWhere = orgId
      ? { organizationId: orgId, status: 'active' }
      : defaultPropertyId
      ? { propertyId: defaultPropertyId, status: 'active' }
      : null
    if (!baseWhere) return mcpError('No property context available')

    const query  = (args['query']  as string  | undefined)?.trim() || undefined
    const limit  = Math.min((args['limit']  as number | undefined) ?? 20, 50)
    const offset = (args['offset'] as number | undefined) ?? 0

    const LARGE_CHAIN_THRESHOLD = 50

    const totalUnfiltered = await prisma.property.count({ where: baseWhere })
    const isLargeChain = totalUnfiltered > LARGE_CHAIN_THRESHOLD

    // Name filter applied in DB — matches property.name only (no HotelConfig relation on Property)
    const nameWhere = query ? {
      ...baseWhere,
      name: { contains: query, mode: 'insensitive' as const },
    } : baseWhere

    const [dbTotal, dbProperties] = await Promise.all([
      query ? prisma.property.count({ where: nameWhere }) : Promise.resolve(totalUnfiltered),
      prisma.property.findMany({
        where: nameWhere,
        select: { propertyId: true, name: true, isDefault: true },
        orderBy: [{ isDefault: 'desc' }, { propertyId: 'asc' }],
        take: limit,
        skip: offset,
      }),
    ])

    // Fallback: DB name search found nothing — match by name/city/country from HG hotel list (single cached call)
    let effectiveProperties = dbProperties
    let effectiveTotal = dbTotal
    if (query && dbProperties.length === 0) {
      const [allProps, allHgHotels] = await Promise.all([
        prisma.property.findMany({
          where: baseWhere,
          select: { propertyId: true, name: true, isDefault: true },
          orderBy: [{ isDefault: 'desc' }, { propertyId: 'asc' }],
        }),
        fetchHotelList().catch(() => [] as Awaited<ReturnType<typeof fetchHotelList>>),
      ])
      const orgPropertyIds = new Set(allProps.map(p => p.propertyId))
      const qLower = query.toLowerCase()
      const matchedIds = new Set(
        allHgHotels
          .filter(h =>
            h.name.toLowerCase().includes(qLower) ||
            h.city.toLowerCase().includes(qLower) ||
            h.country.toLowerCase().includes(qLower)
          )
          .map(h => h.hotel_id)
          .filter(id => orgPropertyIds.has(id))
      )
      const matched = allProps.filter(p => matchedIds.has(p.propertyId))
      effectiveTotal = matched.length
      effectiveProperties = matched.slice(offset, offset + limit)
    }

    const pids = effectiveProperties.map(p => p.propertyId)
    const [configs, statics] = await Promise.all([
      prisma.hotelConfig.findMany({
        where: { propertyId: { in: pids } },
        select: { propertyId: true, displayName: true },
      }),
      Promise.allSettled(pids.map(id => fetchPropertyStatic(id))),
    ])
    const configMap = new Map(configs.map(c => [c.propertyId, c]))
    const staticMap = new Map(
      statics.map((r, i) => [pids[i]!, r.status === 'fulfilled' ? r.value : null])
    )
    const base = orgUrl(orgSlug)
    const list = effectiveProperties.map(p => {
      const s = staticMap.get(p.propertyId)
      const cfg = configMap.get(p.propertyId)
      return {
        propertyId: p.propertyId,
        name: cfg?.displayName || p.name || `Property ${p.propertyId}`,
        isDefault: p.isDefault,
        bookUrl: `${base}/?hotelId=${p.propertyId}`,
        detailUrl: `${env.WEB_BASE_URL}/hotel/${p.propertyId}`,
        ...(s ? {
          stars: s.rating ?? null,
          address: s.location.address || null,
          city: s.location.city.name || null,
          country: s.location.countryCode || null,
          coordinates: s.coordinates.latitude && s.coordinates.longitude
            ? { lat: s.coordinates.latitude, lng: s.coordinates.longitude }
            : null,
          phone: s.contact.phone || null,
          website: s.contact.website || null,
          images: s.images.slice(0, 2).map(i => proxyImage(i.uri)),
        } : {}),
      }
    })
    const paginationNote = offset + list.length < effectiveTotal
      ? `Showing ${offset + 1}–${offset + list.length} of ${effectiveTotal}. Use offset to get more.`
      : undefined
    const largeChainNote = isLargeChain && !query
      ? `This chain has ${totalUnfiltered} hotels in total. Use the query parameter to filter by city or hotel name for more targeted results.`
      : undefined
    const note = paginationNote ?? largeChainNote
    const structuredContent = { properties: list, returned: list.length, total: effectiveTotal, ...(note ? { note } : {}) }
    return {
      content: [{ type: 'text', text: JSON.stringify(structuredContent) }],
      structuredContent,
      _meta: {
        ui: { resourceUri: PROPERTY_LIST_URI },
        properties: list,
        total: effectiveTotal,
        ...(note ? { note } : {}),
      },
    }
  }

  if (toolName === 'get_property_info') {
    if (!pid) return mcpError('propertyId is required for chain-level connections')
    try {
      const [detail, config] = await Promise.all([
        getPropertyDetail(pid),
        prisma.hotelConfig.findUnique({ where: { propertyId: pid } }).catch(() => null),
      ])
      const desc = detail.descriptions.find(d => d.locale === 'en')?.text ?? detail.descriptions[0]?.text ?? ''
      const name = config?.displayName || detail.name
      const base = orgUrl(orgSlug)
      const hotel = {
        propertyId: pid, name, starRating: detail.starRating,
        city: detail.location.city, address: detail.location.address,
        country: detail.location.countryCode, description: desc,
        tagline: config?.tagline ?? null,
        images: detail.images.slice(0, 6).map(i => proxyImage(i.url)),
        bookUrl: `${base}/?hotelId=${pid}`,
        detailUrl: `${env.WEB_BASE_URL}/hotel/${pid}`,
      }
      const structuredContent = { hotel }
      return {
        content: [{ type: 'text', text: JSON.stringify(hotel) }],
        structuredContent,
        _meta: { ui: { resourceUri: PROPERTY_DETAIL_URI }, hotel },
      }
    } catch {
      return mcpError(`Property ${pid} not found`)
    }
  }

  if (toolName === 'search_availability') {
    if (!pid) return mcpError('propertyId is required for chain-level connections')
    const checkIn  = args['checkIn']  as string | undefined
    const checkOut = args['checkOut'] as string | undefined
    if (!checkIn || !checkOut) return mcpError('checkIn and checkOut are required')
    const adults   = (args['adults']   as number | undefined) ?? 2
    const children = (args['children'] as number | undefined) ?? 0
    try {
      const results = await search({
        hotelId: pid,
        checkIn,
        checkOut,
        rooms: [{ adults, ...(children > 0 ? { childAges: Array<number>(children).fill(10) } : {}) }],
      }, undefined, 'mcp')
      const summary = results.results.flatMap(r => r.rooms).map(room => ({
        roomId: room.roomId,
        roomName: room.roomName,
        availableCount: room.availableCount,
        lowestRate: Math.min(...room.rates.map(r => r.prices.sell.amount)),
        currency: results.currency,
        rates: room.rates.slice(0, 3).map(r => ({
          ratePlanId: r.ratePlanId,
          ratePlanName: r.ratePlanName,
          amount: r.prices.sell.amount,
          boardType: r.boardLabel,
        })),
      }))
      const structuredContent = {
        searchId: results.searchId,
        rooms: summary,
        currency: results.currency,
        _nextStep: 'Present these room options to the user. Ask which room and rate they want to book. Do NOT call create_booking_link until the user explicitly selects a room.',
      }

      // Fetch external IBE config for the widget booking URL
      let externalIBEConfig: {
        searchTemplate:  string | null
        bookingTemplate: string | null
        externalHotelId: string | null
        needsSolutionId: boolean
        resolveEndpoint?: string
      } | null = null
      try {
        const extConfig = await getEffectiveExternalIBEConfig(pid)
        if (extConfig?.widgetEnabled && extConfig.bookingTemplate) {
          const needsSolutionId = extConfig.bookingTemplate.includes('{solutionId}')
          externalIBEConfig = {
            searchTemplate:  extConfig.searchTemplate,
            bookingTemplate: extConfig.bookingTemplate,
            externalHotelId: extConfig.externalHotelId,
            needsSolutionId,
            ...(needsSolutionId ? { resolveEndpoint: '/api/v1/public/external-ibe/resolve' } : {}),
          }
        }
      } catch (extErr) {
        logger.warn({ extErr, pid }, '[MCP] getEffectiveExternalIBEConfig failed — widget will use local IBE URL')
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(structuredContent) }],
        structuredContent,
        _meta: {
          ui: { resourceUri: WIDGET_URI },
          ...structuredContent,
          propertyId: pid,
          checkIn,
          checkOut,
          adults,
          webBaseUrl: env.WEB_BASE_URL,
          ...(externalIBEConfig ? { externalIBEConfig } : {}),
        },
      }
    } catch (err) {
      return mcpError(err instanceof Error ? err.message : 'Search failed')
    }
  }

  if (toolName === 'get_room_details') {
    const roomId = args['roomId'] as number | undefined
    if (!roomId) return mcpError('roomId is required')
    if (!pid) return mcpError('propertyId is required for chain-level connections')
    try {
      const detail = await getPropertyDetail(pid)
      const room = detail.rooms.find(r => r.roomId === roomId)
      if (!room) return mcpError(`Room ${roomId} not found`)
      return mcpResult(JSON.stringify({
        roomId: room.roomId,
        name: room.name,
        description: room.descriptions.find(d => d.locale === 'en')?.text ?? room.descriptions[0]?.text ?? '',
        facilities: room.facilities.map(f => f.name),
        images: room.images.slice(0, 3).map(i => i.url),
        beds: room.beds,
      }))
    } catch {
      return mcpError(`Property ${pid} not found`)
    }
  }

  if (toolName === 'create_booking_link') {
    if (!pid) return mcpError('propertyId is required')
    const checkIn  = args['checkIn']  as string | undefined
    const checkOut = args['checkOut'] as string | undefined
    if (!checkIn || !checkOut) return mcpError('checkIn and checkOut are required')
    const adults     = (args['adults']     as number | undefined) ?? 2
    const children   = (args['children']   as number | undefined) ?? 0
    const roomId     = args['roomId']     as number | undefined
    const ratePlanId = args['ratePlanId'] as number | undefined
    const roomName   = args['roomName']   as string | undefined
    const searchId   = args['searchId']   as string | undefined

    // Try external IBE first
    let url: string | null = null
    try {
      const extConfig = await getEffectiveExternalIBEConfig(pid)
      if (extConfig?.mcpEnabled && extConfig.bookingTemplate) {
        const needsSolutionId = extConfig.bookingTemplate.includes('{solutionId}')

        if (needsSolutionId && extConfig.searchTemplate && !extConfig.mcpSkip2Step) {
          const guests = Array(adults).fill('A').join(',')
          const searchUrl = buildExternalUrl(extConfig.searchTemplate, {
            hotelId:         pid,
            externalHotelId: extConfig.externalHotelId,
            checkIn,
            checkOut,
            adults,
            guests,
            rooms:           1,
            nationality:     null,
            currency:        null,
          })
          const resolved = await resolveExternalBookingUrl({
            searchUrl,
            bookingTemplate: extConfig.bookingTemplate,
            externalHotelId: extConfig.externalHotelId,
            checkIn,
            checkOut,
            adults,
            ...(roomName ? { roomName } : {}),
          })
          url = resolved.bookingUrl
        } else if (needsSolutionId && extConfig.searchTemplate && extConfig.mcpSkip2Step) {
          url = buildExternalUrl(extConfig.searchTemplate, {
            hotelId:         pid,
            externalHotelId: extConfig.externalHotelId,
            checkIn,
            checkOut,
            adults,
            guests:          Array(adults).fill('A').join(','),
            rooms:           1,
            nationality:     null,
            currency:        null,
          })
        } else {
          url = buildExternalUrl(extConfig.bookingTemplate, {
            hotelId:         pid,
            externalHotelId: extConfig.externalHotelId,
            checkIn,
            checkOut,
            adults,
            rooms:           1,
            nationality:     null,
            currency:        null,
            roomId:          roomId ?? null,
            ratePlanId:      ratePlanId ?? null,
          })
        }
      }
    } catch (err) {
      logger.warn({ err, pid }, '[MCP] getEffectiveExternalIBEConfig failed — falling back to local IBE URL')
    }

    // Fall back to local IBE URL
    if (!url) {
      const params = new URLSearchParams({
        hotelId: String(pid), checkIn, checkOut,
        'rooms[0][adults]': String(adults),
        ...(children > 0 ? { 'rooms[0][children]': String(children) } : {}),
      })
      if (roomId)     params.set('roomId',     String(roomId))
      if (ratePlanId) params.set('ratePlanId', String(ratePlanId))
      if (searchId)   params.set('searchId',   searchId)
      url = `${env.WEB_BASE_URL}/booking?${params.toString()}`
    }

    return mcpResult(JSON.stringify({ bookingUrl: url, message: 'Direct the guest to this URL to complete the booking.' }))
  }

  return mcpError(`Unknown tool: ${toolName}`)
}

async function dispatchJsonRpc(
  body: { jsonrpc: string; method: string; params?: unknown; id?: string | number | null },
  defaultPropertyId: number | null,
  orgId: number | null,
  orgSlug: string | null,
): Promise<object | null> {
  if (body.jsonrpc !== '2.0') {
    return { jsonrpc: '2.0', error: { code: -32600, message: 'Invalid JSON-RPC version' }, id: body.id ?? null }
  }

  if (body.method === 'initialize') {
    let serverName = 'IBE MCP Server'
    if (orgId) {
      const [org, count] = await Promise.all([
        prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } }),
        prisma.property.count({ where: { organizationId: orgId, status: 'active' } }),
      ])
      if (org) {
        serverName = count > 1
          ? `${org.name} (${count} hotels — use list_properties to browse; supports query/limit/offset)`
          : org.name
      }
    }
    return {
      jsonrpc: '2.0',
      result: { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {}, resources: {} }, serverInfo: { name: serverName, version: '1.0.0' } },
      id: body.id ?? null,
    }
  }

  if (body.method === 'notifications/initialized') return null // 204 / 202

  if (body.method === 'tools/list') {
    return { jsonrpc: '2.0', result: { tools: MCP_TOOLS }, id: body.id ?? null }
  }

  if (body.method === 'resources/list') {
    return {
      jsonrpc: '2.0',
      result: {
        resources: [
          { uri: WIDGET_URI,           name: 'Room Results Widget',  mimeType: 'text/html;profile=mcp-app' },
          { uri: PROPERTY_LIST_URI,    name: 'Hotel List Widget',    mimeType: 'text/html;profile=mcp-app' },
          { uri: PROPERTY_DETAIL_URI,  name: 'Hotel Detail Widget',  mimeType: 'text/html;profile=mcp-app' },
        ],
      },
      id: body.id ?? null,
    }
  }

  if (body.method === 'resources/read') {
    const uri = (body.params as { uri?: string } | undefined)?.uri
    if (uri === WIDGET_URI) {
      return {
        jsonrpc: '2.0',
        result: { contents: [{ uri: WIDGET_URI, mimeType: 'text/html;profile=mcp-app', text: WIDGET_HTML }] },
        id: body.id ?? null,
      }
    }
    if (uri === PROPERTY_LIST_URI) {
      return {
        jsonrpc: '2.0',
        result: { contents: [{ uri: PROPERTY_LIST_URI, mimeType: 'text/html;profile=mcp-app', text: PROPERTY_LIST_HTML }] },
        id: body.id ?? null,
      }
    }
    if (uri === PROPERTY_DETAIL_URI) {
      return {
        jsonrpc: '2.0',
        result: { contents: [{ uri: PROPERTY_DETAIL_URI, mimeType: 'text/html;profile=mcp-app', text: PROPERTY_DETAIL_HTML }] },
        id: body.id ?? null,
      }
    }
    return { jsonrpc: '2.0', error: { code: -32002, message: 'Resource not found' }, id: body.id ?? null }
  }

  if (body.method === 'tools/call') {
    const p = body.params as { name?: string; arguments?: Record<string, unknown> } | undefined
    const result = await handleToolCall(p?.name ?? '', p?.arguments ?? {}, defaultPropertyId, orgId, orgSlug)
    return { jsonrpc: '2.0', result, id: body.id ?? null }
  }

  return { jsonrpc: '2.0', error: { code: -32601, message: `Method not found: ${body.method}` }, id: body.id ?? null }
}

// ── Routes ────────────────────────────────────────────────────────────────────

export async function mcpRoutes(fastify: FastifyInstance) {

  // ── Streamable HTTP (Claude Desktop, Cursor, Windsurf, OpenAI, Gemini, Grok, OAuth) ──
  fastify.post('/mcp', async (request, reply) => {
    const authHeader = (request.headers['authorization'] as string | undefined) ?? ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader
    let scope: Awaited<ReturnType<typeof validateApiKey>> = null
    if (token) {
      if (isJwt(token)) {
        const jwt = await validateMcpJwt(token)
        if (jwt) scope = await getOAuthScope(jwt.sub, jwt.iat, jwt.org)
      } else {
        scope = await validateApiKey(token)
      }
    }
    if (!scope) {
      return reply.status(401).send({ jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized' }, id: null })
    }

    const orgId = scope.kind === 'org' ? scope.orgId : null
    const [defaultPropertyId, orgSlugRow] = await Promise.all([
      resolveDefaultProperty(scope),
      orgId ? prisma.organization.findUnique({ where: { id: orgId }, select: { slug: true } }) : null,
    ])
    const orgSlug = orgSlugRow?.slug ?? null
    const body = request.body as { jsonrpc: string; method: string; params?: unknown; id?: string | number | null }

    try {
      const response = await dispatchJsonRpc(body, defaultPropertyId, orgId, orgSlug)
      if (!response) return reply.status(204).send()
      return reply.send(response)
    } catch (err) {
      logger.error({ err }, '[MCP] Unhandled error')
      return reply.send({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: body.id ?? null })
    }
  })

  // ── Key-in-URL endpoint (ChatGPT App — no Bearer header support) ──────────
  // ChatGPT only supports OAuth 2.1 or no auth; embed the key in the path instead.
  fastify.post('/mcp/:apiKey', async (request, reply) => {
    const { apiKey } = request.params as { apiKey: string }
    const scope = await validateApiKey(apiKey)
    if (!scope) {
      return reply.status(401).send({ jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized' }, id: null })
    }
    const orgId = scope.kind === 'org' ? scope.orgId : null
    const [defaultPropertyId, orgSlugRow] = await Promise.all([
      resolveDefaultProperty(scope),
      orgId ? prisma.organization.findUnique({ where: { id: orgId }, select: { slug: true } }) : null,
    ])
    const orgSlug = orgSlugRow?.slug ?? null
    const body = request.body as { jsonrpc: string; method: string; params?: unknown; id?: string | number | null }
    try {
      const response = await dispatchJsonRpc(body, defaultPropertyId, orgId, orgSlug)
      if (!response) return reply.status(204).send()
      return reply.send(response)
    } catch (err) {
      logger.error({ err }, '[MCP] Unhandled error')
      return reply.send({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: body.id ?? null })
    }
  })

  // ── SSE transport — GET (n8n connects here) ───────────────────────────────
  fastify.get('/mcp', async (request, reply) => {
    const authHeader = (request.headers['authorization'] as string | undefined) ?? ''
    // n8n may also pass token as query param ?token=...
    const queryToken = (request.query as Record<string, string>).token ?? ''
    const raw = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : (authHeader || queryToken)
    const scope = raw ? await validateApiKey(raw) : null
    if (!scope) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }

    const orgId = scope.kind === 'org' ? scope.orgId : null
    const [defaultPropertyId, orgSlugRow] = await Promise.all([
      resolveDefaultProperty(scope),
      orgId ? prisma.organization.findUnique({ where: { id: orgId }, select: { slug: true } }) : null,
    ])
    const orgSlug = orgSlugRow?.slug ?? null
    const sessionId = crypto.randomUUID()

    reply.hijack()
    const res = reply.raw
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    })

    const session: SseSession = {
      write: (data: string) => { try { res.write(data) } catch { /* client disconnected */ } },
      end:   () => { try { res.end() } catch { /* already ended */ } },
      defaultPropertyId,
      orgId,
      orgSlug,
    }
    sseSessions.set(sessionId, session)

    // Send the endpoint URL where n8n should POST messages
    const messageUrl = `/api/v1/mcp/message?sessionId=${sessionId}`
    session.write(`event: endpoint\ndata: ${messageUrl}\n\n`)

    // Heartbeat every 25s to keep the connection alive through proxies
    const heartbeat = setInterval(() => session.write(': ping\n\n'), 25_000)

    request.raw.on('close', () => {
      clearInterval(heartbeat)
      sseSessions.delete(sessionId)
      logger.info({ sessionId }, '[MCP SSE] session closed')
    })

    // Keep connection open — hijack prevents Fastify from auto-finalizing
  })

  // ── SSE transport — POST (n8n sends messages here) ───────────────────────
  fastify.post('/mcp/message', async (request, reply) => {
    const sessionId = (request.query as Record<string, string>).sessionId ?? ''
    const session = sseSessions.get(sessionId)
    if (!session) {
      return reply.status(404).send({ error: 'Session not found or expired' })
    }

    const body = request.body as { jsonrpc: string; method: string; params?: unknown; id?: string | number | null }

    try {
      const response = await dispatchJsonRpc(body, session.defaultPropertyId, session.orgId, session.orgSlug)
      if (response) {
        session.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`)
      }
      return reply.status(202).send()
    } catch (err) {
      logger.error({ err }, '[MCP SSE] Unhandled error')
      const errResponse = { jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: body.id ?? null }
      session.write(`event: message\ndata: ${JSON.stringify(errResponse)}\n\n`)
      return reply.status(202).send()
    }
  })
}
