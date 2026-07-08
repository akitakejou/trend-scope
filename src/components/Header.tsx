import Link from "next/link";

export default function Header() {
  return (
    <header className="p-4 border-b">
      <h1 className="text-3xl font-bold">
        <Link href="/">
          TREND SCOPE
        </Link>
      </h1>
    </header>
  );
}