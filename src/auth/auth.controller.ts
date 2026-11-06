import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService, publicUser } from './auth.service.js';
import { AuthGuard, type AuthRequest } from './auth.guard.js';
import { LoginDto, RefreshDto, RegisterDto } from '../common/request.dto.js';
import { fail } from '../common/errors.js';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  private attempts = new Map<string, { count: number; until: number }>();
  constructor(@Inject(AuthService) private auth: AuthService) {}
  private limit(request: Request) {
    const now = Date.now();
    for (const [key, value] of this.attempts)
      if (value.until < now) this.attempts.delete(key);
    const key = request.ip ?? 'unknown';
    const entry = this.attempts.get(key) ?? { count: 0, until: now + 60000 };
    entry.count++;
    this.attempts.set(key, entry);
    if (entry.count > 20)
      fail(429, 'RATE_LIMITED', 'Muitas tentativas. Aguarde um minuto.');
    const origin = request.headers.origin;
    if (
      origin &&
      !(process.env.WEB_ORIGINS ?? 'http://localhost:8081')
        .split(',')
        .includes(origin)
    )
      fail(403, 'INVALID_ORIGIN', 'Origem não permitida.');
  }
  private deliver(
    result: Awaited<ReturnType<AuthService['login']>>,
    request: Request,
    response: Response,
  ) {
    // Native clients explicitly opt into receiving the refresh token in the body.
    if (request.headers['x-client-platform'] === 'native') return result;
    response.cookie('reservai_refresh', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/v1/auth',
      maxAge: 30 * 86400000,
    });
    return { accessToken: result.accessToken, user: result.user };
  }
  @Post('register') async register(
    @Body() input: RegisterDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.limit(request);
    return this.deliver(await this.auth.register(input), request, response);
  }
  @Post('login') async login(
    @Body() input: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.limit(request);
    return this.deliver(
      await this.auth.login(input.email, input.password),
      request,
      response,
    );
  }
  @Post('refresh') async refresh(
    @Body() input: RefreshDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.limit(request);
    return this.deliver(
      await this.auth.refresh(this.token(input, request)),
      request,
      response,
    );
  }
  @Post('logout') async logout(
    @Body() input: RefreshDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.limit(request);
    await this.auth.logout(this.token(input, request));
    response.clearCookie('reservai_refresh', { path: '/api/v1/auth' });
    return { message: 'Você saiu da sua conta.' };
  }
  private token(input: RefreshDto, request: Request): string | undefined {
    return request.headers['x-client-platform'] === 'native'
      ? input.refreshToken
      : (request.cookies as Record<string, string> | undefined)
          ?.reservai_refresh;
  }
  @Get('me') @UseGuards(AuthGuard) @ApiBearerAuth() me(
    @Req() request: AuthRequest,
  ) {
    return publicUser(request.user);
  }
}
