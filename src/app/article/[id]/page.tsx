import { supabase } from "@/lib/supabase";
import Image from "next/image";
import Link from "next/link";

// Next.js 15の正しい型定義
interface ArticlePageProps {
  params: Promise<{ id: string }>;
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  // 1. Next.js 15の仕様に基づき、paramsを非同期で安全に解決
  const resolvedParams = await params;
  
  // 2. URLの文字列IDを、Supabaseのint8(数値型)に合わせて安全に数値化
  const articleId = parseInt(resolvedParams.id, 10);

  if (isNaN(articleId)) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-500 font-bold">不正な記事IDです。</p>
        <Link href="/" className="mt-4 inline-block text-blue-500 underline">ホームへ戻る</Link>
      </div>
    );
  }

  // 3. Supabaseからデータを取得
  const { data: article, error } = await supabase
    .from("articles")
    .select("*")
    .eq("id", articleId)
    .single();

  if (error || !article) {
    console.error("Supabase fetch error:", error);
    return (
      <div className="p-8 text-center">
        <p className="text-gray-600 font-bold">記事が見つかりません</p>
        <Link href="/" className="mt-4 inline-block text-blue-500 underline">ホームへ戻る</Link>
      </div>
    );
  }

  // JSONB(pros/cons)の型を安全に配列として扱うためのパースガード
  const prosList: string[] = Array.isArray(article.pros) 
    ? article.pros 
    : typeof article.pros === "string" 
      ? JSON.parse(article.pros) 
      : [];

  const consList: string[] = Array.isArray(article.cons) 
    ? article.cons 
    : typeof article.cons === "string" 
      ? JSON.parse(article.cons) 
      : [];

  return (
    <main className="max-w-4xl mx-auto p-6 md:p-12 min-h-screen">
      {/* ナビゲーション（戻るリンク） */}
      <div className="mb-6">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-800 transition">
          ← TREND SCOPE ホームへ戻る
        </Link>
      </div>

      <header className="mb-8">
        <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-0.5 rounded uppercase">
          {article.category}
        </span>
        <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 mt-3 leading-tight">
          {article.title}
        </h1>
        <p className="text-sm text-gray-400 mt-2">公開日: {article.date}</p>
      </header>

      {/* 記事メイン画像 */}
      <div className="relative w-full aspect-video rounded-xl overflow-hidden shadow-md">
        <Image
          src={article.image || "/images/news.jpg"}
          alt={article.title}
          fill
          priority
          className="object-cover"
        />
      </div>

      {/* 要約（サマリー） */}
      <section className="mt-8 bg-gray-50 border-l-4 border-blue-500 p-4 rounded-r shadow-sm">
        <h2 className="text-sm font-bold text-blue-600 tracking-wider uppercase mb-1">【要約】</h2>
        <p className="text-gray-700 leading-relaxed">{article.summary}</p>
      </section>

      {/* 本文 */}
      <section className="mt-10">
        <h2 className="text-2xl font-bold text-gray-800 border-b pb-2 mb-4">記事本文</h2>
        {/* 改行（\n）を保持して美しく表示するためのスタイル */}
        <p className="text-gray-800 leading-loose whitespace-pre-wrap">{article.content}</p>
      </section>

      {/* AI分析 */}
      <section className="mt-12 bg-indigo-50 border border-indigo-100 p-6 rounded-xl shadow-sm">
        <h2 className="text-2xl font-bold text-indigo-900 mb-3 flex items-center gap-2">
          ✨ AIによるトレンド分析
        </h2>
        <p className="text-indigo-950 leading-relaxed whitespace-pre-wrap">{article.analysis}</p>
      </section>

      {/* メリット・デメリット（賛成・反対意見からアップデート） */}
      <div className="mt-12 grid md:grid-cols-2 gap-6">
        <section className="bg-emerald-50 border border-emerald-100 p-6 rounded-xl">
          <h2 className="text-xl font-bold text-emerald-800 mb-4 flex items-center gap-2">
            👍 メリット
          </h2>
          <ul className="space-y-3">
            {prosList.map((p, i) => (
              <li key={i} className="text-emerald-950 flex gap-2">
                <span className="text-emerald-500 font-bold">✓</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-rose-50 border border-rose-100 p-6 rounded-xl">
          <h2 className="text-xl font-bold text-rose-800 mb-4 flex items-center gap-2">
            ⚠️ デメリット・懸念点
          </h2>
          <ul className="space-y-3">
            {consList.map((c, i) => (
              <li key={i} className="text-rose-950 flex gap-2">
                <span className="text-rose-400 font-bold">⚠️</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* 外部リンクリンク */}
      {(article.sourceUrl || article.officialUrl) && (
        <section className="mt-12 pt-6 border-t border-gray-100 text-sm flex flex-col sm:flex-row gap-4">
          {article.sourceUrl && (
            <a href={article.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
              🔗 参考URLを見る
            </a>
          )}
          {article.officialUrl && (
            <a href={article.officialUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
              🌐 公式サイトを確認する
            </a>
          )}
        </section>
      )}
    </main>
  );
}