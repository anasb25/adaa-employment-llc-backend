import { FindManyOptions, Repository, ObjectLiteral } from 'typeorm';

export interface PaginationOptions {
  page: number;
  limit: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export class PaginationUtil {
  /**
   * Creates a paginated response from repository data
   */
  static async paginate<T extends ObjectLiteral>(
    repository: Repository<T>,
    options: PaginationOptions,
    findOptions?: Omit<FindManyOptions<T>, 'skip' | 'take'>,
  ): Promise<PaginatedResponse<T>> {
    const { page, limit } = options;
    const skip = (page - 1) * limit;

    // Get total count
    const total = await repository.count(findOptions);

    // Get paginated data
    const data = await repository.find({
      ...findOptions,
      skip,
      take: limit,
    });

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  /**
   * Creates a paginated response from existing data array
   */
  static createPaginatedResponse<T>(
    data: T[],
    total: number,
    page: number,
    limit: number,
  ): PaginatedResponse<T> {
    const totalPages = Math.ceil(total / limit);

    return {
      data,
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  /**
   * Validates pagination parameters
   */
  static validatePaginationParams(
    page?: number,
    limit?: number,
  ): PaginationOptions {
    const validPage = Math.max(1, page || 1);
    const validLimit = Math.min(Math.max(1, limit || 10), 100); // Max 100 items per page

    return {
      page: validPage,
      limit: validLimit,
    };
  }
}
