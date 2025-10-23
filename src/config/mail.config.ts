import { registerAs } from '@nestjs/config';

export default registerAs('mail', () => ({
  user: process.env.MAIL_USER,
  pass: process.env.MAIL_PASS,
  defaultFrom: process.env.DEFAULT_MAIL_FROM,
}));
