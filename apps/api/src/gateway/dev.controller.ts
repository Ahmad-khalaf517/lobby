@Controller('dev')
export class DevController {
  constructor(private readonly gateway: ChannelGateway) {}

  @Post('emit')
  emit(@Body() body: { channelId: string; event: string; payload: unknown }) {
    this.gateway.server.to(body.channelId).emit(body.event, body.payload);
    return { ok: true };
  }
}
