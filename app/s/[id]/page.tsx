import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { LangProvider } from "@/components/LangProvider";
import Viewer from "@/components/Viewer";
import { bumpViews, getDeck } from "@/lib/db";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const deck = getDeck(id);
  if (!deck) return { title: "Not found" };
  return {
    title: deck.title,
    description: deck.summary_md.replace(/[#*`>\-]/g, "").slice(0, 150),
    // Student decks are shared by link, not search — noindex removes the
    // incentive to spam-host content here.
    robots: { index: false, follow: false },
  };
}

export default async function DeckPage({ params }: Props) {
  const { id } = await params;
  const deck = getDeck(id);
  if (!deck) notFound();
  bumpViews(id);
  return (
    <LangProvider>
      <Viewer deck={deck} />
    </LangProvider>
  );
}
