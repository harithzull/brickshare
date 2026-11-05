import { Body, CanActivate, Controller, ExecutionContext, Get, Global, Injectable, Module, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { AuthRequest, AuthService } from './auth.service';
import { NonceDto, VerifyDto } from './auth.dto';
import { digest, equalHash, rateLimit, requireBrowserMutation } from './security';
import { DatabaseService } from '../database/database.module';
import { ForbiddenException } from '@nestjs/common';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly auth: AuthService, private readonly database: DatabaseService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const session = await this.auth.context(request);
    if (!session) throw new UnauthorizedException('Sign in with your wallet to continue');
    if (!['GET', 'HEAD'].includes(request.method)) {
      requireBrowserMutation(request, this.auth.env);
      if (!equalHash(request.get('X-CSRF-Token'), digest(session.csrfToken))) throw new ForbiddenException('A valid session CSRF token is required');
      await rateLimit(this.database.source.manager, request, 'mutation:' + session.userId, 60);
    }
    request.sessionContext = session;
    return true;
  }
}
@Controller('api/v1')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Post('auth/nonce') nonce(@Body() body: NonceDto, @Req() request: AuthRequest, @Res({ passthrough: true }) response: Response) { return this.auth.nonce(body, request, response); }
  @Post('auth/verify') verify(@Body() body: VerifyDto, @Req() request: AuthRequest, @Res({ passthrough: true }) response: Response) { return this.auth.verify(body, request, response); }
  @Post('auth/logout') @UseGuards(SessionGuard) logout(@Req() request: AuthRequest, @Res({ passthrough: true }) response: Response) { return this.auth.logout(request, response); }
  @Get('me') me(@Req() request: AuthRequest, @Res({ passthrough: true }) response: Response) { return this.auth.me(request, response); }
}
@Global()
@Module({ providers: [AuthService, SessionGuard], controllers: [AuthController], exports: [AuthService, SessionGuard] })
export class AuthModule {}
