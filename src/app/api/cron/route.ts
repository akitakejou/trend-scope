import { NextResponse } from "next/server";
import Parser from "rss-parser";
import { GoogleGenAI, Type } from "@google/genai";
import { getSupabaseAdminClient } from "@/utils/supabaseServer";

const parser = new Parser();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// 収集元のニュースチャンネル（RSSフィード）を定義
const NEWS_CHANNELS = [
  {
    name: "IT・ガジェット・Software",
    url: "https://news.yahoo.co.jp/rss/topics/it.xml",
    fallbackCategory: "Software"
  },
  {
    name: "ビジネス・起業・AI",
    url: "https://news.yahoo.co.jp/rss/topics/business.xml",
    fallbackCategory: "Business"
  },
  {
    name: "エンタメ・SNSバズ・YouTube・TikTok",
    url: "https://news.yahoo.co.jp/rss/topics/entertainment.xml", // カルチャー・エンタメ・配信トレンド
    fallbackCategory: "YouTube"
  },
  {
    name: "ネットの話題・国内トレンド・X",
    url: "https://news.yahoo.co.jp/rss/categories/life.xml", // ライフ・ネットの話題全般
    fallbackCategory: "X"
  }
];

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  
  if (
    process.env.NODE_ENV === "production" &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    // 1. 定義した4つのチャンネルから、今回収集するターゲットをランダムに1つ選定
    const selectedChannel = NEWS_CHANNELS[Math.floor(Math.random() * NEWS_CHANNELS.length)];
    console.log(`[Cron] ターゲット情報源を選出: ${selectedChannel.name}`);
    
    console.log(`[Cron] RSSフィードを取得中: ${selectedChannel.url}`);
    const feed = await parser.parseURL(selectedChannel.url);
    
    if (!feed.items || feed.items.length === 0) {
      throw new Error("RSSフィードからトレンドワードを取得できませんでした。");
    }

    // 上位10件からランダムに1つ記事トピックを選定
    const randomItem = feed.items[Math.floor(Math.random() * Math.min(feed.items.length, 10))];
    const rawTopic = randomItem.title || "";

    // メディア名などのノイズを綺麗に掃除
    const cleanTopic = rawTopic
      .replace(/\s（.+）$/, "")
      .replace(/\s-\s.+$/, "")
      .replace(/[\"\'\`]/g, "")
      .replace(/[【】「」]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const finalTopic = cleanTopic || "最新のSNSトレンド動向";
    console.log(`[Cron] 決定されたリアルタイムトレンド: "${finalTopic}"`);

    // 2. Gemini APIで記事を生成
    // プロンプトを調整し、選ばれた話題に応じてカテゴリ（TikTok, YouTube, Xなど）を自律判定させます
    const systemInstruction = `
あなたはIT・テクノロジー、および各種SNS（X、TikTok、YouTube）のトレンドに精通した敏腕シニアWebライターです。
与えられたトピックについて、背景にあるネット上の反響や世間の反応を含めた高品質なニュース記事を日本語で執筆してください。

【執筆ルール】
1. タイトル: ユーザーの検索意図に沿った、クリックされやすくSEOを意識したタイトル。
2. カテゴリ: トピックの内容を分析し、最も適したものを次の中から「必ず1つだけ」正確に選定してください [TikTok, YouTube, X, Software, AI, Gadget, Business]
   - 例: 動画配信やクリエイター、YouTuber関連なら「YouTube」
   - 例: ショート動画やバズダンス、縦型動画関連なら「TikTok」
   - 例: Xでの炎上、バズ、論争、ハッシュタグ関連なら「X」
   - 例: アプリ、IT技術、WEBサービスなら「Software」や「AI」
3. 要約（summary）: 記事の核心を突いた200文字以上500文字以内の概要。
4. 本文（content）: 世間のリアクションや背景知識を含め、詳細に解説した1000文字以上3000文字以内の本文。
5. 分析（analysis）: AIの視点から、このトレンドが今後どのような変化をもたらすかの深掘り分析。
6. メリット（pros）: このトレンドのポジティブな影響や面白さを3個。
7. デメリット（cons）: 懸念点、課題、ネット上の否定的な意見などを3個。
8. 注意文: 本文（content）の最後には必ず以下の注意文を独立した段落として含めてください。
「※この記事はAIが公開情報をもとに生成したものです。最新情報は公式サイトをご確認ください。」
`;

    console.log("[Cron] Gemini APIでSNS・テック記事を生成中...");
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `以下のトピック情報をもとに、適切なカテゴリを選択して記事を生成してください。\n対象トピック: ${finalTopic}`,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            category: { type: Type.STRING },
            summary: { type: Type.STRING },
            content: { type: Type.STRING },
            analysis: { type: Type.STRING },
            pros: { type: Type.ARRAY, items: { type: Type.STRING } },
            cons: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ['title', 'category', 'summary', 'content', 'analysis', 'pros', 'cons'],
        },
      },
    });

    const responseText = response.text;
    if (!responseText) {
      throw new Error("Geminiからのレスポンスが空でした。");
    }

    const articleData = JSON.parse(responseText);

    // 3. Supabaseにデータを直接保存
    console.log("[Cron] Supabaseにデータを直接保存中...");
    const supabase = getSupabaseAdminClient();
    
    // 生成されたカテゴリが想定外のものだった場合のガードロジック
    const allowedCategories = ["TikTok", "YouTube", "X", "Software", "AI", "Gadget", "Business"];
    const finalCategory = allowedCategories.includes(articleData.category)
      ? articleData.category
      : selectedChannel.fallbackCategory;

    const { data, error } = await supabase
      .from('articles')
      .insert([
        {
          title: articleData.title,
          category: finalCategory,
          image: '/images/news.jpg',
          summary: articleData.summary,
          content: articleData.content,
          analysis: articleData.analysis,
          pros: articleData.pros,
          cons: articleData.cons,
          sourceUrl: randomItem.link || 'https://news.yahoo.co.jp',
          officialUrl: 'https://news.yahoo.co.jp',
          aiGenerated: true,
          date: new Date().toISOString().split('T')[0],
        },
      ])
      .select()
      .single();

    if (error) {
      throw new Error(`Supabaseへの保存に失敗しました: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      message: `情報源 [${selectedChannel.name}] からトレンドを自動生成しました！`,
      detectedTrend: finalTopic,
      assignedCategory: finalCategory,
      data: data
    });

  } catch (error: any) {
    console.error("[Cron Realtime Error]:", error);
    return NextResponse.json(
      { error: "マルチトレンドバッチ処理中にエラーが発生しました。", details: error.message },
      { status: 500 }
    );
  }
}