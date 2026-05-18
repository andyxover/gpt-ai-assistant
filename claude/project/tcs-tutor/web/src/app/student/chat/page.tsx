import { getTutorUser } from '@/lib/tutor/role';
import { redirect } from 'next/navigation';
import { loadOrCreateChatSession, loadMessages, loadScope } from '@/lib/tutor/chat';
import { findActiveSyllabusForStudent } from '@/lib/tutor/mastery';
import { pool } from '@/lib/tutor/db';
import ChatClient from './ChatClient';
import MasteryPanel from '@/components/MasteryPanel';

export default async function ChatPage() {
  const user = await getTutorUser();
  if (!user) redirect('/login');
  if (user.role !== 'student') redirect('/');

  const session = await loadOrCreateChatSession(user.id);
  if (!session.id || !session.classId) {
    return (
      <div className="card">
        <div className="card-title">Not enrolled yet</div>
        <div className="card-desc">Ask your teacher to add you to a class.</div>
      </div>
    );
  }

  const [messages, scope, syl] = await Promise.all([
    loadMessages(session.id),
    loadScope(session.classId),
    findActiveSyllabusForStudent(user.id),
  ]);

  let currentWeek = 1;
  if (syl) {
    const { rows } = await pool.query<{ current_week: number }>(
      `SELECT current_week FROM syllabi WHERE id = $1`,
      [syl.id],
    );
    currentWeek = Number(rows[0]?.current_week ?? 1);
  }

  const scopeLabel = scope.thisWeekConcepts.length
    ? `${scope.thisWeekConcepts.map(c => c.name).join(', ')} · W${scope.weekNumber}`
    : null;

  const initial = (user.display_name?.[0] ?? '?').toUpperCase();

  return (
    <>
      <div className="eyebrow">Ask the tutor</div>
      <h1>Chat</h1>
      <p className="subtitle">Free-form Socratic tutoring on this week&apos;s concepts.</p>
      <div className="with-mastery">
        {syl ? (
          <MasteryPanel
            studentId={user.id}
            syllabusId={syl.id}
            currentWeek={currentWeek}
            label="Mastery (this week)"
          />
        ) : <div />}
        <div>
          <ChatClient initialMessages={messages} scopeLabel={scopeLabel} studentInitial={initial} />
        </div>
      </div>
    </>
  );
}
