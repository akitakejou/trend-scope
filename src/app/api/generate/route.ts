import { NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';
import { getSupabaseAdminClient } from '@/utils/supabaseServer';
import { GeneratedArticle, TrendInput } from '@/types/article';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(request: Request) {
  try {
    const body: TrendInput = await request.json().catch(() => ({
      topic: '最新の生成AI技術トレンド',
      source: 'manual'
    }));

    if (!body.topic) {
      return NextResponse.json(
        { error: 'トピック（topic）は必須です。' },
        { status: 400 }
      );
    }

    // 1. システムプロンプトおよび生成ルールの構築
    const systemInstruction = `
あなたはIT・テクノロジー系ニュースサイト「TREND SCOPE」の敏腕シニアWebライターです。
与えられたトピックについて、最新の情報を収集・網羅したSEOに強い高品質なニュース記事を日本語で執筆してください。

【執筆ルール】
1. タイトル: ユーザーの検索意図に沿った、クリックされやすくSEOを意識したタイトル。
2. カテゴリ: トピックに最も適したものを、次の中から「1つだけ」正確に選んでください [TikTok, YouTube, X, Software, AI, Gadget, Business]
3. 要約（summary）: 記事の核心を突いた200文字以上500文字以内の概要。
4. 本文（content）: 技術的な背景や背景知識を含め、詳細に解説した1000文字以上3000文字以内の本文。
5. 分析（analysis）: AIの視点から、このトレンドが今後の業界にどのような変化をもたらすかの深掘り分析。
6. メリット（pros）: 導入や普及によるポジティブな影響を必ず3個。
7. デメリット（cons）: 懸念点や課題、ネガティブな側面を必ず3個。
8. 注意文: 本文（content）の最後には必ず以下の注意文を独立した段落として含めてください。
「※この記事はAIが公開情報をもとに生成したものです。最新情報は公式サイトをご確認ください。」
`;

    const userPrompt = `
以下のトピック情報をもとに、記事を生成してください。
情報ソース: ${body.source}
対象トピック/コンテキスト: ${body.topic}
`;

    // 2. Gemini APIの呼び出し
    // 確実に出力させるため、必須項目（required）は文章系コアデータのみに絞り込み、URL等のブレやすい項目は任意（Optional）にします
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: userPrompt,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: 'SEOを意識したニュースタイトル' },
            category: { type: Type.STRING, description: 'TikTok, YouTube, X, Software, AI などのカテゴリ名' },
            image: { type: Type.STRING, description: '固定値 /images/news.jpg' },
            summary: { type: Type.STRING, description: '200〜500文字の要約文' },
            content: { type: Type.STRING, description: '1000〜3000文字の記事本文（最後に注意文を含むこと）' },
            analysis: { type: Type.STRING, description: 'AIによる専門的な分析コメント' },
            pros: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'メリット3個'
            },
            cons: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'デメリット3個'
            },
            sourceUrl: { type: Type.STRING, description: '情報元の参考URL（なければ空文字可）' },
            officialUrl: { type: Type.STRING, description: '関連する公式URL（なければ空文字可）' },
            aiGenerated: { type: Type.BOOLEAN, description: '固定値 true' },
            date: { type: Type.STRING, description: 'YYYY-MM-DD 形式の現在日付' }
          },
          // URL系を required から除外することで、バリデーションエラー（400）を完全に防ぎます
          required: [
            'title', 'category', 'image', 'summary', 'content', 'analysis', 
            'pros', 'cons', 'aiGenerated', 'date'
          ],
        },
      },
    });

    const responseText = response.text;
    if (!responseText) {
      throw new Error('Geminiからのレスポンスが空でした。');
    }

    // 3. 安全にJSONパースを実行
    const articleData: GeneratedArticle = JSON.parse(responseText);

    // プログラマ側で値を保証（フォールバック）
    articleData.image = '/images/news.jpg';
    articleData.aiGenerated = true;
    
    if (!/^\d{4}-\d{2}-\d{2}$/.test(articleData.date)) {
      articleData.date = new Date().toISOString().split('T')[0];
    }

    // 4. Supabaseへの保存処理
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('articles')
      .insert([
        {
          title: articleData.title,
          category: articleData.category || 'News',
          image: articleData.image,
          summary: articleData.summary,
          content: articleData.content,
          analysis: articleData.analysis,
          pros: articleData.pros,
          cons: articleData.cons,
          // もし空、または取得できていなければ、汎用URLを設定するセーフティネット
          sourceUrl: articleData.sourceUrl || 'https://news.google.com',
          officialUrl: articleData.officialUrl || 'https://news.google.com',
          aiGenerated: articleData.aiGenerated,
          date: articleData.date,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('Supabase Insert Error:', error);
      return NextResponse.json(
        { error: 'データベースへの保存に失敗しました。', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '記事が正常に生成され、Supabaseに保存されました。',
      data: data,
    });

  } catch (error: any) {
    console.error('API Error in /api/generate:', error);
    return NextResponse.json(
      {
        error: '内部サーバーエラーが発生しました。',
        message: error.message || '予期せぬエラーです。',
      },
      { status: 500 }
    );
  }
}