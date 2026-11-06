import { Inject, Injectable, Module } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserEntity } from '../database/schema.js';
@Injectable()
export class UsersService {
  constructor(@Inject(DataSource) private db: DataSource) {}
  get repository() {
    return this.db.getRepository(UserEntity);
  }
  findByEmail(email: string) {
    return this.repository.findOneBy({ email: email.trim().toLowerCase() });
  }
  findById(id: string) {
    return this.repository.findOneBy({ id });
  }
}
@Module({ providers: [UsersService], exports: [UsersService] })
export class UsersModule {}
