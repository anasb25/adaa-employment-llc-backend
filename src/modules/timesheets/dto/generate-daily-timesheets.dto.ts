import { IsDateString } from 'class-validator';

export class GenerateDailyTimesheetsDto {
  @IsDateString()
  date: string; // YYYY-MM-DD
}

