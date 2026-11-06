import {
  BadRequestException,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { ApiExceptionFilter } from './common/errors.js';
export function setupApp(app: INestApplication) {
  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: (process.env.WEB_ORIGINS ?? 'http://localhost:8081').split(','),
    credentials: true,
  });
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: () =>
        new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Confira os campos informados e tente novamente.',
        }),
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  const config = new DocumentBuilder()
    .setTitle('Reservai API')
    .setDescription(
      'Reservas de espaços, disponibilidade e gestão por proprietário.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(
    'api/docs',
    app,
    SwaggerModule.createDocument(app, config),
  );
}
