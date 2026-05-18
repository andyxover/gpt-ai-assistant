import { NextResponse } from 'next/server';
import { getTutorUser } from '@/lib/tutor/role';
import { loadOrCreateChatSession, loadMessages } from '@/lib/tutor/chat';

export async function GET() {
  const user = await getTutorUser();
  if (!user || user.role !== 'student') {
    return NextResponse.json({ messages: [] }, { status: 401 });
  }
  const session = await loadOrCreateChatSession(user.id);
  if (!session.id) return NextResponse.json({ messages: [] });
  const messages = await loadMessages(session.id);
  return NextResponse.json({ messages });
}
