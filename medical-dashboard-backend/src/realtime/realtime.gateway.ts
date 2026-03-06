import { Injectable, Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { ProtocolEvent } from '../entities';

@WebSocketGateway({
  namespace: 'realtime',
  cors: {
    origin: '*',
  },
})
@Injectable()
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  handleConnection(socket: any) {
    this.logger.debug(`Client connected: ${socket.id}`);
  }

  handleDisconnect(socket: any) {
    this.logger.debug(`Client disconnected: ${socket.id}`);
  }

  broadcastEvent(event: ProtocolEvent) {
    if (!this.server) {
      return;
    }

    this.server.emit('protocol_event', {
      id: event.id,
      companyId: event.companyId,
      companyKey: event.companyKey,
      protocol: event.protocol,
      appointmentId: event.appointmentId,
      name: event.name,
      event: event.event,
      nextGroup: event.nextGroup,
      timestamp: event.timestamp,
    });
  }
}

