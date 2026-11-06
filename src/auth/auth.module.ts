import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { UsersModule } from '../users/users.module.js';
@Global()
@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      useFactory: () => {
        const secret = process.env.JWT_SECRET;
        if (!secret || secret.length < 32 || secret.startsWith('replace-'))
          throw new Error(
            'Configure JWT_SECRET with a random value of at least 32 characters.',
          );
        return { secret, signOptions: { expiresIn: '15m' } };
      },
    }),
  ],
  providers: [AuthService, AuthGuard],
  controllers: [AuthController],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}
