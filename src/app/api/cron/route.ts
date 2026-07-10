import { NextResponse } from "next/server";
import Parser from "rss-parser";
import { GoogleGenAI, Type } from "@google/genai";
import { getSupabaseAdminClient } from "@/utils/supabaseServer";

const parser = new Parser();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// 収集元のチャンネルを定義（YouTubeはAPI経由、その他はRSSから取得）
const NEWS_CHANNELS = [
  {
    id: "software",
    name: "IT・ガジェット・Software",
    url: "https://news.yahoo.co.jp/rss/topics/it.xml",
    fallbackCategory: "Software"
  },
  {
    id: "business",
    name: "ビジネス・起業・AI",
    url: "https://news.yahoo.co.jp/rss/topics/business.xml",
    fallbackCategory: "Business"
  },
  {
    id: "youtube_tiktok",
    name: "本物のYouTube急上昇 ＆ TikTokトレンド枠",
    url: "", // YouTubeはAPIを使うため空欄
    fallbackCategory: "YouTube"
  },
  {
    id: "x_trend",
    name: "ネットの話題・国内トレンド・X",
    url: "https://news.yahoo.co.jp/rss/categories/life.xml",
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

  const results = [];
  const supabase = getSupabaseAdminClient();

  // 4つの情報源を順番にループ処理
  for (const selectedChannel of NEWS_CHANNELS) {
    try {
      console.log(`[Cron] ---------------------------------------------`);
      console.log(`[Cron] ターゲット情報源を処理中: ${selectedChannel.name}`);
      
      let finalTopic = "最新のトレンド動向";
      let sourceUrl = "https://news.yahoo.co.jp";

      // 🔴 YouTubeの枠だけ処理を切り替える
      if (selectedChannel.id === "youtube_tiktok") {
        console.log(`[Cron] YouTube APIから日本の急上昇動画を取得中...`);
        const apiKey = process.env.YOUTUBE_API_KEY;
        
        // 日本(JP)の急上昇動画(mostPopular)を最大10件取得するURL
        const ytUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&chart=mostPopular&regionCode=JP&maxResults=10&key=${apiKey}`;
        
        const ytRes = await fetch(ytUrl);
        const ytData = await ytRes.json();

        if (!ytData.items || ytData.items.length === 0) {
          console.error(`[Cron Error] YouTubeデータの取得に失敗しました。理由:`, ytData.error?.message || "データが空です");
          continue; // 失敗したらこの枠はスキップ
        }

        // 上位10件からランダムに1つの動画タイトルをピックアップ
        const randomVideo = ytData.items[Math.floor(Math.random() * ytData.items.length)];
        finalTopic = randomVideo.snippet.title;
        sourceUrl = `https://www.youtube.com/watch?v={randomVideo.id}`;
        console.log(`[Cron] YouTube急上昇からトピックを決定: "${finalTopic}"`);

      } else {
        // 🔵 通常のヤフーRSSの処理
        console.log(`[Cron] RSSフィードを取得中: ${selectedChannel.url}`);
        const feed = await parser.parseURL(selectedChannel.url!);
        
        if (!feed.items || feed.items.length === 0) {
          console.error(`[Cron Error] ${selectedChannel.name} のRSS取得に失敗しました。`);
          continue;
        }

        const randomItem = feed.items[Math.floor(Math.random() * Math.min(feed.items.length, 10))];
        const rawTopic = randomItem.title || "";
        sourceUrl = randomItem.link || 'https://news.yahoo.co.jp';

        // ノイズ掃除
        finalTopic = rawTopic
          .replace(/\s（.+）$/, "")
          .replace(/\s-\s.+$/, "")
          .replace(/[\"\'\`]/g, "")
          .replace(/[【】「」]/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      }

      // Gemini APIで記事を生成（以前追加したTikTok/YouTube最強プロンプト）
      const systemInstruction = `
あなたはIT・テクノロジー、および各種SNS（X、TikTok、YouTube）の最新トレンドに精通した、神がかったセンスを持つシニアWebライターです。
与えられたニュース（トピック）について、背景にあるネット上の反響や、「もしこれが各SNSで発信されたらどう広がるか」のシミュレーションを含めた高品質なニュース記事を日本語で執筆してください。

【カテゴリ判定・執筆の鉄則】
トピックの内容を分析し、最も適したカテゴリを [TikTok, YouTube, X, Software, AI, Gadget, Business] から「必ず1つだけ」正確に選定してください。

■ TikTok カテゴリが選ばれた場合のシミュレーションルール:
- ニュースをそのまま伝えるのではなく、「TikTokのトレンド音源（BGM）に乗せて、背景動画付きで15秒〜30秒のテキスト解説や『〇〇な人、終わる…』といった強いフックで拡散されている様子」をシミュレーションして執筆してください。
- コメント欄でユーザーたちが「大喜利」をはじめたり、共感・ツッコミで1万件以上のコメントが殺到しているようなネットのリアクション（「これマジ？」「私の青春が終わった」など）を反映させてください。
- 「#〇〇」「#おすすめにのりたい」「#トレンド」といった、TikTok特有のバズハッシュタグの動きも本文や分析に織り交ぜてください。

■ YouTube / YouTubeショート カテゴリが選ばれた場合のシミュレーションルール:
- 「【衝撃】〇〇の裏側がヤバすぎる…」のような、YouTube特有の考察系動画、解説動画、またはVTuberや配信者が生配信（雑談）でこのニュースに触れてリスナーとチャットで盛り上がっている様子をシミュレーションしてください。
- 本文には、動画の「切り抜き動画」が拡散されている背景や、登録者数数十万人の解説チャンネルが急遽動画をアップして急上昇ランク入りしているような臨場感を演出してください。

■ X カテゴリが選ばれた場合のシミュレーションルール:
- インプレッション目的のポストの乱立や、深夜のトレンド1位獲得、10万いいねを超えるバズポストの文体、リプライ欄での激しい議論やユーモアあるツッコミなどのカオスな状況をリアルに描写してください。

【共通の構成ルール】
1. タイトル: ユーザーの検索意図に沿った、クリックされやすくSEOを意識した、少しSNSで引きのあるタイトル。
2. 要約（summary）: 記事の核心を突いた200文字以上500文字以内の概要。
3. 本文（content）: 世間のリアクションや、上記の各SNSでの「疑似的なバズ・拡散状況」を詳細に解説した1000文字以上3000文字以内の本文。
4. 分析（analysis）: AIの視点から、このトレンドが今後のショート動画界隈やSNSカルチャーにどのような変化（新しいミームの誕生など）をもたらすかの深掘り分析。
5. メリット（pros）: このトレンドのポジティブな影響や面白さを3個。
6. デメリット（cons）: 懸念点、課題、ネット上の否定的な意見などを3個。
7. 注意文: 本文（content）の最後には必ず以下の注意文を独立した段落として含めてください。
「※この記事はAIが公開情報をもとに生成したものです。最新情報は公式サイトをご確認ください。」
`;

      console.log(`[Cron] Gemini APIで記事を生成中...`);
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
        console.error(`[Cron Error] Geminiからのレスポンスが空でした。`);
        continue;
      }

      const articleData = JSON.parse(responseText);

      // カテゴリのガード、およびYouTube枠の強制シャッフル
      const allowedCategories = ["TikTok", "YouTube", "X", "Software", "AI", "Gadget", "Business"];
      let finalCategory = allowedCategories.includes(articleData.category)
        ? articleData.category
        : selectedChannel.fallbackCategory;

      // 🔴 YouTube枠から生まれた記事なら、確実にYouTubeかTikTokのカテゴリにする
      if (selectedChannel.id === "youtube_tiktok") {
        finalCategory = Math.random() > 0.5 ? "YouTube" : "TikTok";
      }

      console.log(`[Cron] Supabaseにデータを直接保存中... (カテゴリ: ${finalCategory})`);
      
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
            sourceUrl: sourceUrl,
            officialUrl: 'https://news.yahoo.co.jp',
            aiGenerated: true,
            date: new Date().toISOString().split('T')[0],
          },
        ])
        .select()
        .single();

      if (error) {
        console.error(`[Cron Error] Supabaseへの保存に失敗しました: ${error.message}`);
        continue;
      }

      results.push({
        source: selectedChannel.name,
        trend: finalTopic,
        category: finalCategory,
        success: true
      });

    } catch (innerError: any) {
      console.error(`[Cron Channel Error] ${selectedChannel.name} の処理中にエラーが発生しました:`, innerError.message);
    }
  }

  return NextResponse.json({
    success: true,
    message: "YouTube API連携版・一括処理が完了しました。",
    processedCount: results.length,
    details: results
  });
}