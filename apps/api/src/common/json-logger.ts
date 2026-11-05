import { LoggerService } from '@nestjs/common';

export class JsonLogger implements LoggerService {
  constructor(private readonly write: (line: string) => void = line => process.stdout.write(line + '\n')) {}
  event(level: string, event: string, fields: Record<string, unknown> = {}) {
    this.write(JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...fields }));
  }
  log(_message: unknown, context?: string) { this.event('info', 'framework_log', { context }); }
  warn(_message: unknown, context?: string) { this.event('warn', 'framework_warning', { context }); }
  error(_message: unknown, _trace?: string, context?: string) { this.event('error', 'framework_error', { context }); }
  debug(_message: unknown, context?: string) { this.event('debug', 'framework_debug', { context }); }
  verbose(_message: unknown, context?: string) { this.event('debug', 'framework_verbose', { context }); }
  fatal(_message: unknown, context?: string) { this.event('fatal', 'framework_fatal', { context }); }
}
