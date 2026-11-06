import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { UserEntity, SessionEntity, type User } from '../database/schema.js';
import { fail } from '../common/errors.js';
import { hashPassword, verifyPassword } from './password.js';
import type { RegisterDto } from '../common/request.dto.js';
import { UsersService } from '../users/users.module.js';

export const publicUser = (user: User) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
});
const digest = (token: string) =>
  createHash('sha256').update(token).digest('hex');
@Injectable()
export class AuthService {
  constructor(
    @Inject(DataSource) private db: DataSource,
    @Inject(JwtService) private jwt: JwtService,
    @Inject(UsersService) private users: UsersService,
  ) {}
  async register(input: RegisterDto) {
    const repo = this.users.repository;
    const email = input.email.trim().toLowerCase();
    if (!input.name.trim()) fail(400, 'INVALID_NAME', 'Informe seu nome.');
    const user = repo.create({
      name: input.name.trim(),
      email,
      passwordHash: await hashPassword(input.password),
      role: 'customer',
    });
    try {
      await repo.save(user);
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        fail(409, 'EMAIL_EXISTS', 'Este e-mail já está cadastrado.');
      throw error;
    }
    return this.issue(user);
  }
  async login(email: string, password: string) {
    const user = await this.users.findByEmail(email);
    if (!user || !(await verifyPassword(password, user.passwordHash)))
      fail(401, 'INVALID_CREDENTIALS', 'E-mail ou senha inválidos.');
    return this.issue(user);
  }
  private async issue(user: User) {
    const refreshToken = randomBytes(48).toString('base64url');
    const session = await this.db.getRepository(SessionEntity).save({
      userId: user.id,
      tokenHash: digest(refreshToken),
      expiresAt: new Date(Date.now() + 30 * 86400000),
    });
    return {
      accessToken: await this.jwt.signAsync({ sub: user.id, sid: session.id }),
      refreshToken,
      user: publicUser(user),
    };
  }
  async refresh(token?: string) {
    if (!token) fail(401, 'SESSION_EXPIRED', 'Entre novamente para continuar.');
    return this.db.transaction(async (manager) => {
      const repo = manager.getRepository(SessionEntity);
      const session = await repo.findOne({
        where: { tokenHash: digest(token) },
        lock: { mode: 'pessimistic_write' },
      });
      if (!session || session.expiresAt <= new Date())
        fail(401, 'SESSION_EXPIRED', 'Sua sessão expirou. Entre novamente.');
      const user = await manager
        .getRepository(UserEntity)
        .findOneByOrFail({ id: session.userId });
      const refreshToken = randomBytes(48).toString('base64url');
      session.tokenHash = digest(refreshToken);
      await repo.save(session);
      return {
        accessToken: await this.jwt.signAsync({
          sub: user.id,
          sid: session.id,
        }),
        refreshToken,
        user: publicUser(user),
      };
    });
  }
  async logout(token?: string) {
    if (token)
      await this.db
        .getRepository(SessionEntity)
        .delete({ tokenHash: digest(token) });
  }
  async authenticate(token: string): Promise<User> {
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; sid: string }>(
        token,
      );
      const session = await this.db
        .getRepository(SessionEntity)
        .findOneBy({ id: payload.sid, userId: payload.sub });
      if (!session || session.expiresAt <= new Date())
        throw new Error('Expired session');
      const user = await this.users.findById(payload.sub);
      if (!user) throw new Error('Missing user');
      return user;
    } catch {
      return fail(401, 'UNAUTHORIZED', 'Entre na sua conta para continuar.');
    }
  }
}
