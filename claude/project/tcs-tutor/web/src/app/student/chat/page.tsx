import { getTutorUser } from '@/lib/tutor/role';
import { redirect } from 'next/navigation';
import { loadOrCreateChatSession, loadMessages, loadScope } from '@/lib/tutor/chat';
import ChatClient from './ChatClient';

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

  const [messages, scope] = await Promise.all([
    loadMessages(session.id),
    loadScope(session.classId),
  ]);

  const scopeLabel = scope.thisWeekConcepts.length
    ? `${scope.thisWeekConcepts.map(c => c.name).join(', ')} · W${scope.weekNumber}`
    : null;

  const initial = (user.display_name?.[0] ?? '?').toUpperCase();

  return (
    <>
      <div className="eyebrow">Ask the tutor</div>
      <h1>Chat</h1>
      <p className="subtitle">Free-form Socratic tutoring on this week&apos;s concepts.</p>
      <ChatClient initialMessages={messages} scopeLabel={scopeLabel} studentInitial={initial} />
    </>
  );
}
