import { supabase } from "@/lib/supabase";
import ArticleCard from "@/components/ArticleCard";
import Link from "next/link";

export default async function YouTubePage() {
  const { data: articles } = await supabase
    .from("articles")
    .select("*")
    .ilike("category", "%YouTube%")
    .order("id", { ascending: false });

  return (
    <main className="max-w-4xl mx-auto p-6 md:p-12 min-h-screen">
      <div className="mb-6">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-800 transition">
          ← ホームへ戻る
        </Link>
      </div>

      <header className="border-b pb-4 mb-8">
        <h1 className="text-4xl font-extrabold text-gray-950 tracking-tight">YouTube 急上昇</h1>
        <p className="text-gray-500 mt-2">AIが分析したYouTube動画トレンドとクリエイター動向</p>
      </header>

      <div className="grid gap-6">
        {articles && articles.length > 0 ? (
          articles.map((article) => (
            <ArticleCard key={article.id} {...article} />
          ))
        ) : (
          <p className="text-gray-500 text-center py-12">現在、このカテゴリの記事はありません。</p>
        )}
      </div>
    </main>
  );
}