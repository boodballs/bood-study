import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-5 text-center">
      <div className="text-5xl">🗂️</div>
      <h1 className="mt-4 text-xl font-bold text-stone-900">
        404 — this set does not exist
      </h1>
      <p className="mt-2 text-sm text-stone-500">
        The link may be broken, or the set was removed.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-xl bg-violet-600 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-violet-700"
      >
        New set
      </Link>
    </div>
  );
}
