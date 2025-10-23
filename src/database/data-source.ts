import { DataSource } from 'typeorm';
import { join } from 'path';
import databaseConfig from '../config/database.config';
import appConfig from '../config/app.config';

const dbConfig = databaseConfig();
const appConfiguration = appConfig();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: dbConfig.host,
  port: dbConfig.port,
  username: dbConfig.username,
  password: dbConfig.password,
  database: dbConfig.database,
  entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
  subscribers: [join(__dirname, 'src', 'database', 'subscribers', '*.{ts,js}')],
  synchronize: false, // Always false in production
  logging: appConfiguration.nodeEnv === 'development',
  migrationsRun: false,
  migrationsTableName: 'migrations',
});
