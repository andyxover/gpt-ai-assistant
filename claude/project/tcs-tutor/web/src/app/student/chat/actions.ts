'use server';

import { revalidatePath } from 'next/cache';
import { getTutorUser } from '@/lib/tutor/role';
import { loadOrCreateChatSession, chatTurn } from '@/lib/tutor/chat';

export async function sendChat(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const user = await getTutorUser();
  if (!user || user.role !== 'student') return { ok: false, error: 'Not signed in as a student' };

  const text = String(formData.get('text') ?? '').trim();
  if (!text) return { ok: false, error: 'Type a message first.' };

  const session = await loadOrCreateChatSession(user.id);
  if (!session.id || !session.classId) return { ok: false, error: "You're not enrolled in a class yet." };

  const result = await chatTurn({
    sessionId: session.id,
    studentId: user.id,
    studentName: user.display_name,
    classId: session.classId,
    studentText: text,
  });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath('/student/chat');
  return { ok: true };
}
