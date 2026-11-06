import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import type { User } from '../database/schema.js';
import { AuthService } from './auth.service.js';
export type AuthRequest = Request & { user: User };
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AuthService) private auth: AuthService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    request.user = await this.auth.authenticate(
      request.headers.authorization?.replace(/^Bearer /, '') ?? '',
    );
    return true;
  }
}
