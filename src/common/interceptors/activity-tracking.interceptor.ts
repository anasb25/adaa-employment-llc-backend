import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../modules/users/entities/user.entity';

@Injectable()
export class ActivityTrackingInterceptor implements NestInterceptor {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    return next.handle().pipe(
      tap(async () => {
        // Only update activity for authenticated users
        if (user && user.id) {
          try {
            await this.userRepository.update(user.id, {
              lastActivity: new Date(),
            });
          } catch (error) {
            // Log error but don't fail the request
            console.error('Failed to update user activity:', error);
          }
        }
      }),
    );
  }
}
