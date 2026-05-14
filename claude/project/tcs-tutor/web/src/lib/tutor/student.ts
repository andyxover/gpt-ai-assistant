import { pool } from './db';

export interface EnrolledClass {
  id: string;
  display_name: string;
  subject: string;
  section: string;
  teacher_display: string | null;
}

export async function listEnrolledClasses(studentId: string): Promise<EnrolledClass[]> {
  const { rows } = await pool.query<EnrolledClass>(
    `SELECT c.id, c.display_name, c.subject, c.section,
            (SELECT u.display_name FROM users u WHERE u.id = c.teacher_user_id) AS teacher_display
       FROM enrollments e
       JOIN classes c ON c.id = e.class_id
      WHERE e.student_id = $1
        AND e.withdrawn_at IS NULL
        AND c.archived_at IS NULL
      ORDER BY c.subject, c.display_name`,
    [studentId],
  );
  return rows;
}
