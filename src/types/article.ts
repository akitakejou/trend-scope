export interface GeneratedArticle {
  title: string;
  category: string;
  image: string;
  summary: string;
  content: string;
  analysis: string;
  pros: string[];
  cons: string[];
  sourceUrl: string;
  officialUrl: string;
  aiGenerated: boolean;
  date: string;
}

// 外部トレンドソースの拡張用インターフェース
export interface TrendInput {
  topic: string;
  source: 'manual' | 'x' | 'youtube' | 'tiktok' | 'yahoo';
  rawContextData?: string; // 各種APIからの生のレスポンステキストなど
}