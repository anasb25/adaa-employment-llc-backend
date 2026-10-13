import { Repository } from 'typeorm';
import { Permission } from '../../modules/permissions/entities/permission.entity';
import { User } from '../../modules/users/entities/user.entity';

/** Load per-user permissions in a separate query so role permissions are not cross-joined. */
export async function attachUserPermissions(
  userRepository: Repository<User>,
  users: Array<User | null | undefined>,
): Promise<void> {
  const list = users.filter((user): user is User => !!user?.id);
  if (list.length === 0) return;

  const ids = [...new Set(list.map((user) => user.id))];
  const rows: Array<Permission & { userId: number }> = await userRepository.query(
    `SELECT up."userId" AS "userId",
            p.id, p.name, p.description, p."isActive",
            p."createdAt", p."createdBy", p."updatedAt", p."updatedBy",
            p."deletedAt", p."deletedBy"
     FROM user_permissions up
     INNER JOIN permissions p ON p.id = up."permissionId"
     WHERE up."userId" = ANY($1::int[])`,
    [ids],
  );

  const grouped = new Map<number, Permission[]>();
  for (const id of ids) grouped.set(id, []);
  for (const row of rows) {
    const userId = Number(row.userId);
    const bucket = grouped.get(userId);
    if (!bucket) continue;
    bucket.push({
      id: row.id,
      name: row.name,
      description: row.description,
      isActive: row.isActive,
      createdAt: row.createdAt,
      createdBy: row.createdBy,
      updatedAt: row.updatedAt,
      updatedBy: row.updatedBy,
      deletedAt: row.deletedAt,
      deletedBy: row.deletedBy,
    } as Permission);
  }

  for (const user of list) {
    user.permissions = grouped.get(user.id) ?? [];
  }
}
