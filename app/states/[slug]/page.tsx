import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { StatusView } from "@/components/status-view";
import { getStatusState, statusStates } from "@/lib/status-states";

type StatusPageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return statusStates.map((state) => ({ slug: state.slug }));
}

export async function generateMetadata({ params }: StatusPageProps): Promise<Metadata> {
  const { slug } = await params;
  const state = getStatusState(slug);
  return { title: state?.title ?? "Durum bulunamadı" };
}

export default async function StatusPage({ params }: StatusPageProps) {
  const { slug } = await params;
  const state = getStatusState(slug);
  if (!state) notFound();

  if (state.appScreen && state.active) {
    return <AppShell active={state.active} code={state.code}><StatusView state={state} /></AppShell>;
  }

  return (
    <main className="public-status-page">
      <header className="public-header"><Link className="brand" href="/">trAI</Link><span className="route-code">{state.code}</span></header>
      <StatusView state={state} />
    </main>
  );
}
