import { Inject, Injectable } from '@nestjs/common';
import { UserEntity } from '../domain/user.entity';
import { CreateUserInput, IUserRepository, USER_REPOSITORY } from '../domain/user.repository';

export type { CreateUserInput } from '../domain/user.repository';

@Injectable()
export class UsersService {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: IUserRepository,
  ) {}

  findById(id: string): Promise<UserEntity | null> {
    return this.users.findById(id);
  }

  findByEmail(email: string): Promise<UserEntity | null> {
    return this.users.findByEmail(email);
  }

  create(input: CreateUserInput): Promise<UserEntity> {
    return this.users.create(input);
  }
}
