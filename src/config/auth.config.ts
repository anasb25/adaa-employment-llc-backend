import { registerAs } from '@nestjs/config';

export default registerAs('auth', () => ({
  jwtSecret:
    process.env.JWT_SECRET ||
    'your-super-secret-jwt-key-change-this-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  jwtRefreshSecret:
    process.env.JWT_REFRESH_SECRET ||
    'your-super-secret-refresh-key-change-this-in-production',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
}));
