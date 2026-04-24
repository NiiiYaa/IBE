import type { FastifyInstance } from 'fastify'
import {
  listGuests, getGuestById, updateGuestProfile, deleteGuestAccount,
  addGuestNote, deleteGuestNote, setGuestBlocked, getGuestStats,
} from '../services/guest.service.js'
import { prisma } from '../db/client.js'

export async function adminGuestsRoutes(fastify: FastifyInstance) {
  // GET /admin/guests
  fastify.get('/admin/guests', async (request, reply) => {
    const { search, isBlocked, page = '1', pageSize = '25' } =
      request.query as { search?: string; isBlocked?: string; page?: string; pageSize?: string }

    const organizationId = request.admin.organizationId
    if (!organizationId) return reply.status(403).send({ error: 'Forbidden' })

    const result = await listGuests({
      organizationId,
      search,
      isBlocked: isBlocked === 'true' ? true : isBlocked === 'false' ? false : undefined,
      page: parseInt(page, 10),
      pageSize: Math.min(parseInt(pageSize, 10), 100),
    })

    return reply.send({
      guests: result.guests.map(g => ({
        id: g.id,
        email: g.email,
        firstName: g.firstName,
        lastName: g.lastName,
        phone: g.phone,
        nationality: g.nationality,
        isBlocked: g.isBlocked,
        blockedReason: g.blockedReason,
        createdAt: g.createdAt.toISOString(),
      })),
      total: result.total,
      page: parseInt(page, 10),
      pageSize: Math.min(parseInt(pageSize, 10), 100),
    })
  })

  // GET /admin/guests/:id
  fastify.get('/admin/guests/:id', async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10)
    const guestData = await getGuestById(id)
    if (guestData.organizationId !== request.admin.organizationId) return reply.status(404).send({ error: 'Guest not found' })
    const [statsData, notes] = await Promise.all([
      getGuestStats(guestData.id, guestData.email),
      prisma.guestNote.findMany({ where: { guestId: id }, orderBy: { createdAt: 'desc' } }),
    ])
    return reply.send({
      id: guestData.id,
      email: guestData.email,
      firstName: guestData.firstName,
      lastName: guestData.lastName,
      phone: guestData.phone,
      nationality: guestData.nationality,
      isBlocked: guestData.isBlocked,
      blockedReason: guestData.blockedReason,
      createdAt: guestData.createdAt.toISOString(),
      stats: statsData,
      notes: notes.map(n => ({
        id: n.id,
        content: n.content,
        authorName: n.authorName,
        createdAt: n.createdAt.toISOString(),
      })),
    })
  })

  // PUT /admin/guests/:id
  fastify.put('/admin/guests/:id', async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10)
    const { firstName, lastName, phone, nationality } =
      request.body as { firstName?: string; lastName?: string; phone?: string | null; nationality?: string | null }
    const updated = await updateGuestProfile(id, { firstName, lastName, phone, nationality })
    return reply.send({
      id: updated.id, email: updated.email,
      firstName: updated.firstName, lastName: updated.lastName,
      phone: updated.phone, nationality: updated.nationality,
    })
  })

  // DELETE /admin/guests/:id
  fastify.delete('/admin/guests/:id', async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10)
    await deleteGuestAccount(id)
    return reply.send({ ok: true })
  })

  // POST /admin/guests/:id/notes
  fastify.post('/admin/guests/:id/notes', async (request, reply) => {
    const guestId = parseInt((request.params as { id: string }).id, 10)
    const { content } = request.body as { content: string }
    if (!content?.trim()) return reply.status(400).send({ error: 'content is required' })
    const admin = request.admin
    const adminUser = await prisma.adminUser.findUnique({ where: { id: admin.adminId }, select: { name: true } })
    const note = await addGuestNote(guestId, admin.adminId, adminUser?.name ?? 'Admin', content.trim())
    return reply.status(201).send(note)
  })

  // DELETE /admin/guests/:id/notes/:noteId
  fastify.delete('/admin/guests/:id/notes/:noteId', async (request, reply) => {
    const noteId = parseInt((request.params as { id: string; noteId: string }).noteId, 10)
    await deleteGuestNote(noteId)
    return reply.send({ ok: true })
  })

  // PUT /admin/guests/:id/block
  fastify.put('/admin/guests/:id/block', async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10)
    const { isBlocked, reason } = request.body as { isBlocked: boolean; reason?: string }
    const updated = await setGuestBlocked(id, isBlocked, reason)
    return reply.send({ id: updated.id, isBlocked: updated.isBlocked, blockedReason: updated.blockedReason })
  })
}
