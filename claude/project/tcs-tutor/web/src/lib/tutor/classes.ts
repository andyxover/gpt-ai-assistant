import { pool } from './db';
import type { ParsedScope } from './parse-syllabus';

export interface ClassRow {
  id: string;
  display_name: string;
  subject: string;
  grade: number;
  section: string;
  academic_year: string;
}

export interface ActiveSyllabus {
  id: string;
  semester: string;
  current_week: number;
  parsed_scope: ParsedScope | null;
}

export async function listClassesForTeacher(teacherId: string): Promise<ClassRow[]> {
  const { rows } = await pool.query<ClassRow>(
    `SELECT id, display_name, subject, grade, section, academic_year
       FROM classes
      WHERE teacher_user_id = $1 AND archived_at IS NULL
      ORDER BY academic_year DESC, display_name`,
    [teacherId],
  );
  return rows;
}

export async function getClassForTeacher(classId: string, teacherId: string): Promise<ClassRow | null> {
  const { rows } = await pool.query<ClassRow>(
    `SELECT id, display_name, subject, grade, section, academic_year
       FROM classes
      WHERE id = $1 AND teacher_user_id = $2 AND archived_at IS NULL`,
    [classId, teacherId],
  );
  return rows[0] ?? null;
}

export async function getActiveSyllabus(classId: string): Promise<ActiveSyllabus | null> {
  const { rows } = await pool.query<ActiveSyllabus>(
    `SELECT id, semester, current_week, parsed_scope
       FROM syllabi
      WHERE class_id = $1 AND superseded_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1`,
    [classId],
  );
  return rows[0] ?? null;
}
