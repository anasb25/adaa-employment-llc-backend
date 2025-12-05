# Timesheet Feature Documentation

## Overview

The Timesheet feature allows ADAA supervisors to track employee attendance and work hours at project sites on a daily basis. This feature integrates with the existing allocations system to manage employee acceptance, skill tracking, and hour logging.

## Database Schema

### Timesheets Table

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| allocationId | INTEGER | Foreign key to project_allocations |
| date | DATE | Date of work (YYYY-MM-DD) |
| status | ENUM | Employee acceptance status |
| skillWorkedId | INTEGER | Foreign key to skills (nullable) |
| hoursWorked | INTEGER | Hours worked (minimum 1) |
| notes | TEXT | Additional notes (nullable) |
| createdAt | TIMESTAMP | Record creation timestamp |
| createdBy | INTEGER | User who created the record |
| updatedAt | TIMESTAMP | Record update timestamp |
| updatedBy | INTEGER | User who updated the record |
| deletedAt | TIMESTAMP | Soft delete timestamp |
| deletedBy | INTEGER | User who deleted the record |

### Status Enum Values

- `accepted_allocated_skill`: Employee accepted for originally allocated skill
- `accepted_different_skill`: Employee accepted but working on different skill
- `rejected`: Employee rejected by site supervisor

### Indexes

- `IDX_timesheets_allocationId`: Index on allocationId for faster lookups
- `IDX_timesheets_date`: Index on date for date-based queries
- `IDX_timesheets_allocation_date_unique`: Unique constraint on (allocationId, date) to prevent duplicates

## Running the Migration

1. **Make sure your database is connected**:
   ```bash
   # Check .env file for database configuration
   DB_HOST=localhost
   DB_PORT=5432
   DB_USERNAME=your_username
   DB_PASSWORD=your_password
   DB_NAME=adaa_employment
   ```

2. **Run the migration**:
   ```bash
   npm run migration:run
   ```

3. **To revert the migration (if needed)**:
   ```bash
   npm run migration:revert
   ```

4. **To generate a new migration (after entity changes)**:
   ```bash
   npm run migration:generate -- src/database/migrations/YourMigrationName
   ```

## API Endpoints

### Base URL
All endpoints are prefixed with `/api/timesheets`

### Authentication & Authorization
- All endpoints require JWT authentication
- Minimum role: `manager` or `admin`
- Required permission: `employee:read` (for reads), `employee:create` (for creates), `employee:update` (for updates), `employee:delete` (for deletes)

### Endpoints

#### 1. Get All Timesheets (with filters)
```http
GET /api/timesheets?projectId={id}&employeeId={id}&startDate={date}&endDate={date}&status={status}&page={page}&limit={limit}
```

**Query Parameters:**
- `projectId` (optional): Filter by project ID
- `employeeId` (optional): Filter by employee ID
- `startDate` (optional): Filter from date (YYYY-MM-DD)
- `endDate` (optional): Filter to date (YYYY-MM-DD)
- `status` (optional): Filter by status enum value
- `page` (optional): Page number for pagination
- `limit` (optional): Items per page

**Response:**
```json
{
  "data": [
    {
      "id": 1,
      "allocationId": 5,
      "date": "2024-01-15",
      "status": "accepted_allocated_skill",
      "skillWorkedId": 3,
      "hoursWorked": 8,
      "notes": "Regular day",
      "allocation": {
        "id": 5,
        "employee": { "id": 2, "name": "John Doe", "adaa_emp_code": "EMP001" },
        "project": { "id": 1, "name": "Project Alpha", "client": {...} }
      },
      "skillWorked": { "id": 3, "skill": "Welding" },
      "createdAt": "2024-01-15T10:00:00Z",
      "updatedAt": "2024-01-15T10:00:00Z"
    }
  ],
  "total": 50,
  "page": 1,
  "limit": 20,
  "totalPages": 3,
  "hasNext": true,
  "hasPrev": false
}
```

#### 2. Get Timesheet Statistics
```http
GET /api/timesheets/stats?projectId={id}&employeeId={id}&startDate={date}&endDate={date}
```

**Query Parameters:** Same as Get All Timesheets

**Response:**
```json
{
  "data": {
    "totalHours": 320,
    "totalDays": 40,
    "acceptedCount": 38,
    "rejectedCount": 2,
    "differentSkillCount": 5
  }
}
```

#### 3. Get Timesheets by Date
```http
GET /api/timesheets/by-date/{date}
```

**Parameters:**
- `date`: Date in YYYY-MM-DD format

**Response:** Array of timesheet objects

#### 4. Get Single Timesheet
```http
GET /api/timesheets/{id}
```

**Response:** Single timesheet object with relations

#### 5. Get Timesheets by Allocation
```http
GET /api/timesheets/allocation/{allocationId}
```

**Response:** Array of timesheet objects for the specific allocation

#### 6. Create Single Timesheet
```http
POST /api/timesheets
```

**Request Body:**
```json
{
  "allocationId": 5,
  "date": "2024-01-15",
  "status": "accepted_allocated_skill",
  "skillWorkedId": 3,
  "hoursWorked": 8,
  "notes": "Regular day"
}
```

**Validation Rules:**
- `allocationId`: Required, must exist
- `date`: Required, must be valid date string (YYYY-MM-DD)
- `status`: Required, must be valid enum value
- `skillWorkedId`: Required for accepted statuses, optional for rejected
- `hoursWorked`: Required for accepted statuses, minimum 1
- `notes`: Optional

**Response:** Created timesheet object

#### 7. Create Multiple Timesheets (Bulk)
```http
POST /api/timesheets/bulk
```

**Request Body:**
```json
{
  "timesheets": [
    {
      "allocationId": 5,
      "date": "2024-01-15",
      "status": "accepted_allocated_skill",
      "skillWorkedId": 3,
      "hoursWorked": 8,
      "notes": "Regular day"
    },
    {
      "allocationId": 6,
      "date": "2024-01-15",
      "status": "rejected",
      "hoursWorked": 0,
      "notes": "Employee not needed"
    }
  ]
}
```

**Response:** Array of created timesheet objects

#### 8. Update Timesheet
```http
PATCH /api/timesheets/{id}
```

**Request Body:**
```json
{
  "status": "accepted_different_skill",
  "skillWorkedId": 4,
  "hoursWorked": 6,
  "notes": "Switched to carpentry"
}
```

**Response:** Updated timesheet object

#### 9. Delete Timesheet
```http
DELETE /api/timesheets/{id}
```

**Response:** No content (soft delete)

## Business Logic

### Validation Rules

1. **Allocation Validation**
   - Allocation must exist before creating a timesheet
   - Cannot create duplicate timesheets for the same allocation and date

2. **Skill Validation**
   - Skill must exist if provided
   - Required for `accepted_allocated_skill` and `accepted_different_skill` statuses
   - Not required for `rejected` status

3. **Hours Validation**
   - Must be at least 1 for accepted statuses
   - Can be 0 for rejected status
   - No maximum limit (can work overtime)

4. **Status Transitions**
   - All status transitions are allowed during updates
   - Changing to `rejected` clears skill and hours requirements
   - Changing from `rejected` to accepted requires skill and hours

### Workflow

1. **Allocation Phase** (Existing Feature)
   - Supervisor allocates employees to projects
   - Sets start date, end date, and notes

2. **Daily Work** (External Process)
   - Employees work at project sites
   - Site supervisor tracks attendance and hours
   - Site supervisor provides daily list to ADAA supervisor

3. **EOD Data Entry** (New Feature)
   - ADAA supervisor opens "Create Timesheet" page
   - Selects the date
   - Adds employees from active allocations
   - For each employee:
     - Sets status (accepted/accepted with different skill/rejected)
     - Selects skill worked (if different from allocated)
     - Enters hours worked
     - Adds any notes
   - Submits all entries in bulk

4. **Reporting & Analytics**
   - View timesheets with various filters
   - See statistics (total hours, days, acceptance rates)
   - Calculate revenue and expenses based on hours worked

## Frontend Integration

The frontend already has the following components:
- `TimesheetManagement.tsx`: Main timesheet listing with filters and statistics
- `CreateTimesheet.tsx`: Bulk entry page for EOD data entry
- `timesheetsApi.ts`: API service layer
- `timesheet.ts`: TypeScript types

The frontend uses the `/timesheets` and `/timesheets/create` routes.

## Testing the API

### Using cURL

```bash
# Get all timesheets
curl -X GET "http://localhost:3000/api/timesheets" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get timesheets for a specific date
curl -X GET "http://localhost:3000/api/timesheets/by-date/2024-01-15" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Create a single timesheet
curl -X POST "http://localhost:3000/api/timesheets" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "allocationId": 5,
    "date": "2024-01-15",
    "status": "accepted_allocated_skill",
    "skillWorkedId": 3,
    "hoursWorked": 8
  }'

# Bulk create timesheets
curl -X POST "http://localhost:3000/api/timesheets/bulk" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "timesheets": [
      {
        "allocationId": 5,
        "date": "2024-01-15",
        "status": "accepted_allocated_skill",
        "skillWorkedId": 3,
        "hoursWorked": 8
      }
    ]
  }'

# Get statistics
curl -X GET "http://localhost:3000/api/timesheets/stats?startDate=2024-01-01&endDate=2024-01-31" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Performance Considerations

1. **Indexes**: The migration creates indexes on `allocationId` and `date` for faster queries
2. **Unique Constraint**: Prevents duplicate entries at the database level
3. **Bulk Operations**: Use bulk create endpoint for better performance when entering multiple timesheets
4. **Pagination**: Use pagination for large datasets
5. **Filtering**: Apply filters at the database level to reduce data transfer

## Security

1. **Authentication**: All endpoints require valid JWT token
2. **Authorization**: Role-based access control (RBAC) with permissions
3. **Input Validation**: All inputs validated using class-validator
4. **SQL Injection**: Protected by TypeORM's parameterized queries
5. **Soft Delete**: Records are soft-deleted, not permanently removed

## Troubleshooting

### Migration Issues

**Problem**: Migration fails with "relation already exists"
**Solution**: Check if table already exists and revert migration first

**Problem**: Migration fails with foreign key constraint error
**Solution**: Ensure project_allocations and skills tables exist

### API Issues

**Problem**: 401 Unauthorized
**Solution**: Check JWT token is valid and not expired

**Problem**: 403 Forbidden
**Solution**: Check user has required role and permissions

**Problem**: 400 Bad Request - "Allocation not found"
**Solution**: Ensure allocation ID exists and is not soft-deleted

**Problem**: 400 Bad Request - "Timesheet already exists"
**Solution**: Check for existing timesheet with same allocation and date

## Future Enhancements

1. **Timesheet Approval Workflow**: Add approval status and workflow
2. **Payroll Integration**: Calculate wages based on hours and rates
3. **Revenue Calculation**: Automatic revenue calculation based on client rates
4. **Reports**: Generate PDF reports for timesheets
5. **Notifications**: Email/SMS notifications for timesheet submissions
6. **Mobile App**: Mobile app for site supervisors to submit timesheets
7. **Geolocation**: Track employee location when marking attendance
8. **Photo Verification**: Upload photos as proof of work

## Support

For issues or questions:
1. Check this documentation
2. Review the code comments
3. Contact the development team
4. Create an issue in the project repository

