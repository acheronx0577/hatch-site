import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer
} from '@nestjs/websockets'
import { UsePipes, ValidationPipe, Logger } from '@nestjs/common'
import { Server, Socket } from 'socket.io'
import jwt from 'jsonwebtoken'

import { PresenceService } from './presence.service'
import { PrismaService } from '@/modules/prisma/prisma.service'

const parseCookies = (header?: string) => {
  if (!header) return {}
  const out: Record<string, string> = {}
  const parts = header.split(';')
  for (const part of parts) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const key = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    if (!key) continue
    out[key] = decodeURIComponent(value)
  }
  return out
}

const resolvePresenceAuthRequired = () => {
  const configured = (process.env.PRESENCE_REQUIRE_AUTH ?? '').trim()
  if (configured) return configured.toLowerCase() === 'true'
  return process.env.NODE_ENV === 'production'
}

const resolveJwtSecret = () => process.env.JWT_ACCESS_SECRET ?? process.env.API_JWT_SECRET ?? null

const resolveCorsOrigins = () => {
  const configured = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
  return configured.length ? configured : true
}

const resolveTokenFromSocket = (client: Socket) => {
  const authHeader = (client.handshake.headers?.authorization as string | undefined)?.trim()
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim()
  }

  const authToken = (client.handshake.auth as any)?.token
  if (typeof authToken === 'string' && authToken.trim()) {
    return authToken.trim()
  }

  const cookieHeader = client.handshake.headers?.cookie as string | undefined
  const cookies = parseCookies(cookieHeader)
  const cookieToken = cookies['access_token']
  if (cookieToken && cookieToken.trim()) {
    return cookieToken.trim()
  }

  return null
}

const resolveJwtUser = (token: string) => {
  const secret = resolveJwtSecret()
  if (!secret) return null
  try {
    const payload = jwt.verify(token, secret) as Record<string, any>
    const userId = payload.userId ?? payload.sub ?? payload.id ?? null
    const orgId = payload.orgId ?? payload.organizationId ?? null
    return { payload, userId, orgId }
  } catch {
    return null
  }
}

@WebSocketGateway({
  namespace: '/presence',
  cors: {
    origin: resolveCorsOrigins(),
    credentials: true
  }
})
export class PresenceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server

  private readonly logger = new Logger(PresenceGateway.name)

  constructor(
    private readonly presence: PresenceService,
    private readonly prisma: PrismaService
  ) {}

  async handleConnection(client: Socket) {
    const requireAuth = resolvePresenceAuthRequired()
    const token = resolveTokenFromSocket(client)
    const jwtUser = token ? resolveJwtUser(token) : null

    const query = client.handshake.query as Record<string, unknown>
    const queryOrgId = typeof query.orgId === 'string' ? query.orgId : null
    const queryUserId = typeof query.userId === 'string' ? query.userId : null

    const userId = jwtUser?.userId ?? (requireAuth ? null : queryUserId)
    const orgId = queryOrgId ?? jwtUser?.orgId ?? null

    if (!orgId || !userId) {
      this.logger.warn('Presence connection missing orgId/userId')
      client.disconnect(true)
      return
    }

    if (requireAuth && !jwtUser?.userId) {
      this.logger.warn('Presence connection missing valid auth token')
      client.disconnect(true)
      return
    }

    const membership = await this.prisma.userOrgMembership.findUnique({
      where: { userId_orgId: { userId, orgId } },
      select: { userId: true }
    })
    if (!membership) {
      this.logger.warn('Presence connection rejected: user not in org')
      client.disconnect(true)
      return
    }

    client.data.orgId = orgId
    client.data.userId = userId
    client.join(orgId)
    await this.presence.record(orgId, userId, 'dashboard')
    this.broadcastActive(orgId)
  }

  async handleDisconnect(client: Socket) {
    const { orgId, userId } = client.data
    if (orgId && userId) {
      await this.presence.cleanupStale()
      this.broadcastActive(orgId)
    }
  }

  @SubscribeMessage('presence:update')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }))
  async updateLocation(@ConnectedSocket() client: Socket, @MessageBody() data: { location: string }) {
    const { orgId, userId } = client.data
    if (!orgId || !userId || !data?.location) return
    await this.presence.record(orgId, userId, data.location)
    this.broadcastEntity(orgId, data.location)
  }

  @SubscribeMessage('presence:heartbeat')
  async heartbeat(@ConnectedSocket() client: Socket) {
    const { orgId, userId } = client.data
    if (!orgId || !userId) return
    await this.presence.record(orgId, userId, 'heartbeat')
  }

  private async broadcastActive(orgId: string) {
    const summary = await this.presence.activeSummary(orgId)
    this.server.to(orgId).emit('presence:activeSummary', summary)
  }

  private async broadcastEntity(orgId: string, location: string) {
    const viewers = await this.presence.viewers(orgId, location)
    this.server.to(orgId).emit('presence:entity', { location, viewers })
  }
}
