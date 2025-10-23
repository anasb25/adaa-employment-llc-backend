import { registerAs } from '@nestjs/config';

export default registerAs('auth', () => ({
  tokenIntrospectionUrl:
    process.env.TOKEN_INTROSPECTION_URL ||
    'http://localhost:3000/auth/introspect',
  permissionCheckUrl:
    process.env.PERMISSION_CHECK_URL ||
    'http://localhost:3000/auth/check-permission',
  roleCheckUrl:
    process.env.ROLE_CHECK_URL || 'http://localhost:3000/auth/check-role',
}));
