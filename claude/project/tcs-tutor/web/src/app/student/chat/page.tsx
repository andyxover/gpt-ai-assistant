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
      <main className="max-w-3xl mx-auto p-6 sm:p-8">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
          <p className="font-medium">You&apos;re not enrolled in a class yet.</p>
          <p className="text-sm text-stone-600 mt-1">Ask your teacher to add you.</p>
        </div>
      </main>
    );
  }

  const [messages, scope] = await Promise.all([
    loadMessages(session.id),
    loadScope(session.classId),
  ]);

  const scopeLabel = scope.thisWeekConcepts.length
    ? `${scope.thisWeekConcepts.map(c => c.name).join(', ')} (Week ${scope.weekNumber})`
    : null;

  return (
    <main className="max-w-3xl mx-auto p-6 sm:p-8">
      <ChatClient initialMessages={messages} scopeLabel={scopeLabel} />
    </main>
  );
}
