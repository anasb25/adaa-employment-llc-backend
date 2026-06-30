// import { MigrationInterface, QueryRunner } from 'typeorm';

// export class CalculateEmployeeAirTicketsAndAnnualLeave1773162600004 implements MigrationInterface {
//   name = 'CalculateEmployeeAirTicketsAndAnnualLeave1773162600004';

//   public async up(queryRunner: QueryRunner): Promise<void> {
//     // Get all employees with date_of_joining
//     const employees = await queryRunner.query(`
//             SELECT id, "date_of_joining"
//             FROM "employees"
//             WHERE "date_of_joining" IS NOT NULL
//         `);

//     const today = new Date();

//     // Calculate and update each employee
//     for (const employee of employees) {
//       if (!employee.date_of_joining) continue;

//       const joinDate = new Date(employee.date_of_joining);
//       const yearsOfService = (today.getTime() - joinDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
//       const airTickets = Math.floor(yearsOfService);
//       const annualLeaveBalance = Math.floor(yearsOfService) * 30;

//       await queryRunner.query(
//         `
//                 UPDATE "employees"
//                 SET
//                     "air_tickets" = $1,
//                     "annual_leave_balance" = $2
//                 WHERE "id" = $3
//             `,
//         [airTickets, annualLeaveBalance, employee.id],
//       );
//     }
//   }

//   public async down(queryRunner: QueryRunner): Promise<void> {
//     // Reset to default values
//     await queryRunner.query(`
//             UPDATE "employees"
//             SET
//                 "air_tickets" = 0,
//                 "annual_leave_balance" = 0
//         `);
//   }
// }
