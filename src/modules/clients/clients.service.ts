import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Client } from './entities/client.entity';
import {
  PaginationOptions,
  PaginatedResponse,
  PaginationUtil,
} from '../../common/utils/pagination.util';

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
  ) {}

  async findAllPaginated(
    options: PaginationOptions,
  ): Promise<PaginatedResponse<Client>> {
    return await PaginationUtil.paginate(this.clientRepository, options, {
      relations: ['projects'],
      order: { createdAt: 'DESC' },
    });
  }

  async findAll(): Promise<Client[]> {
    return await this.clientRepository.find({
      relations: ['projects'],
      order: { createdAt: 'DESC' },
    });
  }

  async search(
    query: string,
    options: PaginationOptions,
  ): Promise<PaginatedResponse<Client>> {
    const searchTerm = `%${query}%`;
    return await PaginationUtil.paginate(this.clientRepository, options, {
      relations: ['projects'],
      where: [
        { name: ILike(searchTerm) },
        { address: ILike(searchTerm) },
        { contactPerson: ILike(searchTerm) },
        { contactNumber: ILike(searchTerm) },
        { email: ILike(searchTerm) },
        { notes: ILike(searchTerm) },
      ],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Client | null> {
    return await this.clientRepository.findOne({
      where: { id },
      relations: ['projects'],
    });
  }

  async create(data: Partial<Client>): Promise<Client> {
    const entity = this.clientRepository.create(data);
    return await this.clientRepository.save(entity);
  }

  async update(id: number, data: Partial<Client>): Promise<Client> {
    await this.clientRepository.update(id, data);
    return (await this.findOne(id)) as Client;
  }

  async remove(id: number): Promise<void> {
    await this.clientRepository.softDelete(id);
  }
}
