import Link from "next/link";

interface SimplePageProps {
  title: string;
  description: string;
}

export function SimplePage({ title, description }: SimplePageProps) {
  return (
    <main className="page-shell">
      <h1>{title}</h1>
      <p>{description}</p>
      <Link href="/">Jenan BIZ</Link>
    </main>
  );
}
