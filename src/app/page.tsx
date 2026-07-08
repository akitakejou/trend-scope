import Image from "next/image";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import ArticleCard from "../components/ArticleCard";

export default async function Home() {
  const { data: articles } = await supabase
    .from("articles")
    .select("*")
    .order("date", { ascending: false });

  return (
    <main className="min-h-screen p-8">
      <h1 className="text-5xl font-bold flex items-center gap-2">
        <Image
          src="/images/NanoBanana-2026-06-24.png"
          width={50}
          height={50}
          alt="TREND SCOPE"
        />
        TREND SCOPE
      </h1>

      <p className="mt-4 text-xl">
        SNS・TikTok・YouTube・Xの話題をAIが分析
      </p>

      {/* カテゴリリンク */}
      <div className="mt-6 flex gap-6 text-lg">
        <Link href="/tiktok">TikTok</Link>
        <Link href="/youtube">YouTube</Link>
        <Link href="/x">X</Link>
        <Link href="/news">SNSニュース</Link>
      </div>

      <h2 className="mt-8 text-2xl font-bold">最新記事</h2>

      <div className="mt-8 grid gap-4">
        {articles?.map((article) => (
          <ArticleCard key={article.id} {...article} />
        ))}
      </div>
    </main>
  );
}