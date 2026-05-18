import { redirect } from 'next/navigation';

export default async function ParentRoot({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  const sp = await searchParams;
  const qs = sp.child ? `?child=${sp.child}` : '';
  redirect(`/parent/this-week${qs}`);
}
