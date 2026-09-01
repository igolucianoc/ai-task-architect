import { Injectable, ConflictException, UnauthorizedException, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { User } from '@prisma/client';
import { UsersService } from '../../users/application/users.service';
import { TokenService } from './token.service';
import { RegisterDto, LoginDto } from '../schemas/auth.schemas';

const BCRYPT_COST = 12;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult {
  user: PublicUser;
  tokens: AuthTokens;
}

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersService,
    private readonly tokens: TokenService,
  ) {}

  async register(dto: RegisterDto, userAgent?: string): Promise<AuthResult> {
    const existing = await this.users.findByEmail(dto.email);
    if (existing) {
      // Mensagem genérica: não confirmar quais e-mails existem.
      throw new ConflictException('Não foi possível concluir o cadastro');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST);
    const user = await this.users.create({
      email: dto.email,
      passwordHash,
      displayName: dto.displayName,
    });

    return this.buildAuthResult(user, userAgent);
  }

  async login(dto: LoginDto, userAgent?: string): Promise<AuthResult> {
    const user = await this.users.findByEmail(dto.email);

    // Comparação sempre executada para mitigar timing attack de enumeração.
    const passwordMatches = user
      ? await bcrypt.compare(dto.password, user.passwordHash)
      : await bcrypt.compare(dto.password, DUMMY_HASH);

    if (!user || !passwordMatches) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    return this.buildAuthResult(user, userAgent);
  }

  /**
   * Rotação de refresh token com detecção de reuse.
   * - token desconhecido → 401
   * - token já revogado/expirado → revoga todas as sessões do usuário (reuse) → 401
   * - token válido → revoga o atual e emite um novo par (rotação)
   */
  async refresh(rawToken: string, userAgent?: string): Promise<AuthResult> {
    const session = await this.tokens.findSessionByRawToken(rawToken);
    if (!session) {
      throw new UnauthorizedException('Sessão inválida');
    }

    if (!this.tokens.isSessionActive(session)) {
      this.logger.warn(
        `Reuse de refresh token detectado para o usuário ${session.userId}; revogando todas as sessões`,
      );
      await this.tokens.revokeAllSessionsForUser(session.userId);
      throw new UnauthorizedException('Sessão inválida');
    }

    const user = await this.users.findById(session.userId);
    if (!user) {
      throw new UnauthorizedException('Sessão inválida');
    }

    await this.tokens.revokeSession(session.id);
    return this.buildAuthResult(user, userAgent);
  }

  async logout(rawToken: string): Promise<void> {
    const session = await this.tokens.findSessionByRawToken(rawToken);
    if (session && this.tokens.isSessionActive(session)) {
      await this.tokens.revokeSession(session.id);
    }
    // Logout é idempotente: token inexistente ou já revogado não é erro.
  }

  private async buildAuthResult(user: User, userAgent?: string): Promise<AuthResult> {
    const accessToken = this.tokens.signAccessToken({ sub: user.id, email: user.email });
    const { rawToken } = await this.tokens.issueRefreshToken(user.id, userAgent);

    return {
      user: this.toPublicUser(user),
      tokens: { accessToken, refreshToken: rawToken },
    };
  }

  private toPublicUser(user: User): PublicUser {
    return { id: user.id, email: user.email, displayName: user.displayName };
  }
}

// Hash fixo de uma senha aleatória, usado para manter tempo constante no login
// quando o e-mail não existe. Não corresponde a nenhuma senha real.
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEeO3zHqQpDx0kZ3z9uJ0Zx5Yk8fJ0qZ0K';
