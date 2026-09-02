import { describe, it, expect, beforeEach } from 'vitest';
import { UsersService } from './users.service';
import { InMemoryUserRepository } from '../persistence/in-memory-user.repository';

describe('UsersService', () => {
  let repository: InMemoryUserRepository;
  let service: UsersService;

  beforeEach(() => {
    repository = new InMemoryUserRepository();
    service = new UsersService(repository);
  });

  it('cria um usuário e o recupera por id', async () => {
    const created = await service.create({
      email: 'ana@example.com',
      passwordHash: 'hash',
      displayName: 'Ana',
    });

    expect(created.id).toBeTruthy();
    expect(created.email).toBe('ana@example.com');

    const found = await service.findById(created.id);
    expect(found?.id).toBe(created.id);
    expect(found?.displayName).toBe('Ana');
  });

  it('recupera um usuário por e-mail', async () => {
    await service.create({
      email: 'bruno@example.com',
      passwordHash: 'hash',
      displayName: 'Bruno',
    });

    const found = await service.findByEmail('bruno@example.com');
    expect(found?.email).toBe('bruno@example.com');
  });

  it('retorna null quando o usuário não existe', async () => {
    expect(await service.findById('inexistente')).toBeNull();
    expect(await service.findByEmail('inexistente@example.com')).toBeNull();
  });

  it('expõe uma projeção pública sem o hash da senha', async () => {
    const created = await service.create({
      email: 'ana@example.com',
      passwordHash: 'segredo',
      displayName: 'Ana',
    });

    const publicUser = created.toPublicUser();
    expect(publicUser).toEqual({ id: created.id, email: 'ana@example.com', displayName: 'Ana' });
    expect(publicUser).not.toHaveProperty('passwordHash');
  });
});
