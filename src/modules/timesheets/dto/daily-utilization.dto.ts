import { IsDateString } from 'class-validator';

export class DailyUtilizationQueryDto {
  @IsDateString()
  date: string; // YYYY-MM-DD format
}

export interface TradeUtilization {
  tradeInSite: string;
  headCount: number;
}

export interface ProjectUtilization {
  projectId: number;
  projectName: string;
  location: string | null;
  fat: string | null;
  trades: TradeUtilization[];
}

export interface ClientUtilization {
  clientId: number;
  clientName: string;
  projects: ProjectUtilization[];
  total: number;
}

export interface DailyUtilizationReport {
  date: string;
  clients: ClientUtilization[];
  totalManpower: number;
}
