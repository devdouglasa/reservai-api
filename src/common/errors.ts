import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

export function fail(status: number, code: string, message: string): never {
  throw new HttpException({ code, message }, status);
}
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private logger = new Logger('ApiExceptionFilter');
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (error instanceof HttpException) {
      const body = error.getResponse();
      const data =
        typeof body === 'object'
          ? (body as { code?: string; message?: string | string[] })
          : { message: body };
      const fallback: Record<number, string> = {
        400: 'Confira os dados informados.',
        401: 'Entre na sua conta para continuar.',
        403: 'Você não tem permissão para esta operação.',
        404: 'Recurso não encontrado.',
        429: 'Muitas tentativas. Aguarde um momento.',
      };
      return response.status(error.getStatus()).json({
        code: data.code ?? 'INVALID_REQUEST',
        message: data.code
          ? Array.isArray(data.message)
            ? data.message.join(' ')
            : data.message
          : (fallback[error.getStatus()] ??
            'Não foi possível concluir a operação.'),
      });
    }
    this.logger.error(error instanceof Error ? error.stack : 'Unknown error');
    return response.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Não foi possível concluir a operação. Tente novamente.',
    });
  }
}
