import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  UsePipes,
  Inject,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ConfigType } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { AuthService, PublicUser } from '../application/auth.service';
import { AuthenticatedUser } from '../infrastructure/jwt.strategy';
import { Public } from '../infrastructure/public.decorator';
import { CurrentUser } from '../infrastructure/current-user.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { registerSchema, loginSchema, RegisterDto, LoginDto } from '../schemas/auth.schemas';
import {
  REFRESH_COOKIE_NAME,
  setRefreshCookie,
  clearRefreshCookie,
} from '../infrastructure/auth.cookie';
import { appConfig } from '../../../config/app.config';

interface AuthResponseBody {
  user: PublicUser;
  accessToken: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  @UsePipes(new ZodValidationPipe(registerSchema))
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseBody> {
    const result = await this.auth.register(dto, req.headers['user-agent']);
    this.attachRefreshCookie(res, result.tokens.refreshToken);
    return { user: result.user, accessToken: result.tokens.accessToken };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(loginSchema))
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseBody> {
    const result = await this.auth.login(dto, req.headers['user-agent']);
    this.attachRefreshCookie(res, result.tokens.refreshToken);
    return { user: result.user, accessToken: result.tokens.accessToken };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseBody> {
    const rawToken = this.extractRefreshToken(req);
    const result = await this.auth.refresh(rawToken, req.headers['user-agent']);
    this.attachRefreshCookie(res, result.tokens.refreshToken);
    return { user: result.user, accessToken: result.tokens.accessToken };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const rawToken = this.readRefreshCookie(req);
    if (rawToken) {
      await this.auth.logout(rawToken);
    }
    clearRefreshCookie(res, this.isProduction);
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): PublicUser {
    return { id: user.id, email: user.email, displayName: user.displayName };
  }

  private attachRefreshCookie(res: Response, token: string): void {
    setRefreshCookie(res, token, this.isProduction, this.config.refreshTokenTtlDays);
  }

  private extractRefreshToken(req: Request): string {
    const token = this.readRefreshCookie(req);
    if (!token) {
      throw new UnauthorizedException('Sessão inválida');
    }
    return token;
  }

  private readRefreshCookie(req: Request): string | undefined {
    const cookies = req.cookies as Record<string, string> | undefined;
    return cookies?.[REFRESH_COOKIE_NAME];
  }

  private get isProduction(): boolean {
    return this.config.nodeEnv === 'production';
  }
}
