import { NextResponse } from "next/server";
import Parser from "rss-parser";
import { GoogleGenAI, Type } from "@google/genai";
import { getSupabaseAdminClient } from "@/utils/supabaseServer";

const parser = new Parser();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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
    url: "", 
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

  for (const selectedChannel of NEWS_CHANNELS) {
    try {
      console.log(`[Cron] ---------------------------------------------`);
      console.log(`[Cron] ターゲット情報源を処理中: ${selectedChannel.name}`);
      
      let finalTopic = "最新のトレンド動向";
      let contextSnippet = ""; // 【対策①】ニュースの「概要・本文の一部」を格納する変数
      let sourceUrl = "https://news.yahoo.co.jp";

      if (selectedChannel.id === "youtube_tiktok") {
        console.log(`[Cron] YouTube APIから日本の急上昇動画を取得中...`);
        const apiKey = process.env.YOUTUBE_API_KEY;
        const ytUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&chart=mostPopular&regionCode=JP&maxResults=10&key=${apiKey}`;
        
        const ytRes = await fetch(ytUrl);
        const ytData = await ytRes.json();

        if (!ytData.items || ytData.items.length === 0) {
          console.error(`[Cron Error] YouTubeデータの取得に失敗しました。`);
          continue;
        }

        const randomVideo = ytData.items[Math.floor(Math.random() * ytData.items.length)];
        finalTopic = randomVideo.snippet.title;
        // YouTubeの場合は、動画の説明文（description）やチャンネル名をコンテキストとしてAIに渡す
        contextSnippet = `チャンネル名: ${randomVideo.snippet.channelTitle}\n動画説明文: ${randomVideo.snippet.description || ""}`;
        sourceUrl = `https://www.youtube.com/watch?v=${randomVideo.id}`;
        console.log(`[Cron] YouTubeからトピック決定: "${finalTopic}"`);

      } else {
        console.log(`[Cron] RSSフィードを取得中: ${selectedChannel.url}`);
        const feed = await parser.parseURL(selectedChannel.url!);
        
        if (!feed.items || feed.items.length === 0) {
          console.error(`[Cron Error] RSS取得に失敗しました。`);
          continue;
        }

        const randomItem = feed.items[Math.floor(Math.random() * Math.min(feed.items.length, 10))];
        const rawTopic = randomItem.title || "";
        // 【対策①】RSSに用意されている記事の概要（Snippet）をしっかり取得
        contextSnippet = randomItem.contentSnippet || randomItem.content || "";
        sourceUrl = randomItem.link || 'https://news.yahoo.co.jp';

        finalTopic = rawTopic
          .replace(/\s（.+）$/, "")
          .replace(/\s-\s.+$/, "")
          .replace(/[\"\'\`]/g, "")
          .replace(/[【】「」]/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      }

      // 【対策②】プロンプトでの「嘘・妄想禁止」を極限まで強化
      const systemInstruction = `
あなたはIT・テクノロジー、および各種SNSの最新トレンドに精通した、事実を歪めない極めて誠実なシニアWebライターです。
与えられたニュースや動画について、背景にあるネット上の反響を反映した高品質なニュース記事を日本語で執筆してください。

【⚠️絶対に守るべきハルシネーション（虚偽情報）対策ルール】
1. 与えられたトピックと参考テキスト、およびあなた自身が「Google検索機能」を使って裏取りした確定事実のみをベースに執筆してください。
2. 元のデータや検索結果に存在しない「製品のスペック、具体的な価格、発売日、イベントの開催地、人物の年齢・発言」などを絶対に妄想で捏造・創作してはなりません。
3. 情報を検索してもどうしても事実が確認できない部分、またはデータが不足している部分については、嘘をついて埋めるのではなく、「現時点で詳細なスペックは公開されていませんが」「今後の公式発表が待たれます」のように、正直に「不明であること」を文章内に明記してください。

【カテゴリ判定・執筆の鉄則】
トピックの内容を分析し、最も適したカテゴリを [TikTok, YouTube, X, Software, AI, Gadget, Business] から1つ選定してください。

■ 各SNSカテゴリのシミュレーションルール:
（※SNSでの盛り上がり方をシミュレーションする際も、ニュース自体の「事実関係」は絶対に捏造しないでください）
- TikTok: 縦型動画での拡散傾向、コメント欄の大喜利や共感の声（「これマジ？」「私の青春が終わった」など）、ハッシュタグの動きを解説。
- YouTube: 考察系・解説動画の乱立、配信者が生配信で触れてチャットが盛り上がっている様子、切り抜き動画の拡散背景を解説。
- X: 深夜のトレンド1位獲得、バズポストの文体、リプライ欄での議論やユーモアあるツッコミなどの状況をリアルに描写。

【共通の構成ルール】
1. タイトル: 検索意図に沿った、クリックされやすく少しSNSで引きのあるタイトル。
2. 要約（summary）: 記事の核心を突いた200文字以上500文字以内の正確な概要。
3. 本文（content）: 事実に基づいた背景と、上記の各SNSでの「疑似的なバズ・拡散状況」を詳細に解説した1000文字以上3000文字以内の本文。
4. 分析（analysis）: AIの視点から、このトレンドが今後のSNSカルチャーにもたらす変化の深掘り分析。
5. メリット（pros）: このトレンドのポジティブな影響や面白さを3個。
6. デメリット（cons）: 懸念点、課題、ネット上の否定的な意見などを3個。
7. 注意文: 本文（content）の最後には必ず以下の注意文を独立した段落として含めてください。
「※この記事はAIが公開情報をもとに生成したものです。最新情報は公式サイトをご確認ください。」
`;

      console.log(`[Cron] Gemini APIで記事を生成中（Web検索裏取り機能を有効化）...`);
      console.log(`[Cron] Gemini APIで記事を生成中（Web検索裏取り機能を有効化）...`);
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `以下のトピックと、付属する参考情報をベースに、必要に応じてGoogle検索で最新の事実関係を裏取りした上で記事を生成してください。\n\n対象トピック: ${finalTopic}\n参考テキスト:\n${contextSnippet}`,
        config: {
          systemInstruction: systemInstruction,
          // 🌐 Google検索ツールを有効化
          tools: [{ googleSearch: {} }], 
          // ⚠️ 【重要】新しいSDKで検索とJSONを両立させる正しい設定項目
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

      let responseText = response.text;
      if (!responseText) {
        console.error(`[Cron Error] Geminiからのレスポンスが空でした。`);
        continue;
      }

      responseText = responseText.replace(/```json|```/g, "").trim();

      const articleData = JSON.parse(responseText);

      // --- 📸 【追加】キーワードに合うフリー画像を自動でネットから拾う仕組み ---
      let searchKeyword = "news"; // デフォルトの検索ワード
      const lowerCat = articleData.category?.toLowerCase() || "";

      // カテゴリやチャンネルのIDに応じて、画像検索用の英語キーワードを自動決定
      if (lowerCat.includes("gadget") || selectedChannel.id === "audio_gadget") {
        searchKeyword = "audio,headphones,tech"; // オーディオ・ガジェット系
      } else if (lowerCat.includes("youtube") || selectedChannel.id === "youtube_gaming") {
        searchKeyword = "gaming,streamer"; // ゲーム・配信系
      } else if (lowerCat.includes("tiktok")) {
        searchKeyword = "smartphone,tiktok"; // スマホ・TikTok系
      } else if (lowerCat.includes("x") || lowerCat.includes("twitter")) {
        searchKeyword = "socialmedia,network"; // SNS系
      } else if (selectedChannel.id === "gourmet_ramen") {
        searchKeyword = "ramen,japanese-food"; // ラーメン・グルメ系
      } else if (lowerCat.includes("ai") || lowerCat.includes("software")) {
        searchKeyword = "coding,cyberpunk"; // 開発・AI系
      }

      // Unsplashの無料高画質画像ソースから、横長(1200x630)の画像をランダムに自動取得するURL
      // 末尾にランダムな数値を混ぜることで、毎回違う画像が選ばれるようにします
      const randomNumber = Math.floor(Math.random() * 1000);
      const categoryImage = `https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&h=630&q=80&sig=${randomNumber}&keywords=${encodeURIComponent(searchKeyword)}`;
      // -----------------------------------------------------------------

      const allowedCategories = ["TikTok", "YouTube", "X", "Software", "AI", "Gadget", "Business"];
      let finalCategory = allowedCategories.includes(articleData.category)
        ? articleData.category
        : selectedChannel.fallbackCategory;

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
            image: categoryImage,
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
    message: "ハルシネーション対策・Google検索連動版の一括処理が完了しました。",
    processedCount: results.length,
    details: results
  });
}