import { NextRequest, NextResponse } from 'next/server';

const ZHIPU_KEY = process.env.ZHIPU_API_KEY!;
const BASE_URL = 'https://open.bigmodel.cn/api/paas/v4';

// 通用文本调用函数
async function callGLM(messages: any[], model = 'glm-4-flash') {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ZHIPU_KEY}`,
    },
    body: JSON.stringify({ model, messages, max_tokens: 1500 }),
  });
  const data = await res.json();
  return data.choices[0].message.content as string;
}

// 图像理解（带图片）
async function analyzeImage(imageBase64: string, mime: string, market: string, event: string, desc: string) {
  return callGLM([{
    role: 'user',
    content: [
      { type: 'image_url', image_url: { url: `data:${mime};base64,${imageBase64}` } },
      { type: 'text', text: `你是跨境电商产品分析师。分析这张产品图，提取3-5个核心卖点（工艺/材质/特色）。目标市场：${market}，营销节点：${event}。补充描述：${desc || '无'}。输出格式：【卖点1】xxx【卖点2】xxx` }
    ]
  }], 'glm-4v-flash');
}

// 生成场景图
async function generateImage(market: string, event: string, sellingPoints: string) {
  const prompt = `${market}节日场景商业摄影，模特佩戴手工云南扎染耳环，背景为${market}标志性地标，${event}节日氛围，时尚大片风格，卖点：${sellingPoints.substring(0, 50)}，高质量，细节清晰`;
  const res = await fetch(`${BASE_URL}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ZHIPU_KEY}`,
    },
    body: JSON.stringify({ model: 'cogview-3-flash', prompt, n: 1, size: '1024x1024' }),
  });
  const data = await res.json();
  return data.data[0].url as string;
}

// 生成脚本
async function generateScript(market: string, platform: string, event: string, sellingPoints: string) {
  return callGLM([{
    role: 'user',
    content: `你是${market}本地化营销文案专家。基于卖点：${sellingPoints}，为${platform}写一个15秒短视频分镜脚本，适合${event}。
格式（严格4行）：
【0-3秒】画面 | 字幕/配音
【3-8秒】画面 | 字幕/配音
【8-12秒】画面 | 含英文/本地语字幕
【12-15秒】CTA画面 | 本地语Call to Action`
  }]);
}

// 生成标签
async function generateTags(market: string, platform: string, event: string, desc: string) {
  return callGLM([{
    role: 'user',
    content: `你是${platform}平台SEO专家，专注${market}市场。产品：${desc || '手工扎染耳环'}，节点：${event}。
生成20个热词标签，包含品类词/节日词/地域词/情感词，中英/本地语混合。
只输出标签，以#开头，空格分隔，不要其他内容。`
  }]);
}

// 主接口：POST /api/generate
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { imageBase64, imageMime, market, platform, event, desc } = body;

    // 用 SSE（流式）逐步返回进度给前端
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: object) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        try {
          // 1号员工：分析图片
          send({ step: 1, status: 'active', msg: '正在分析产品图...' });
          const sellingPoints = imageBase64
            ? await analyzeImage(imageBase64, imageMime, market, event, desc)
            : await callGLM([{ role: 'user', content: `产品：${desc || '手工扎染耳环'}，提取适合${market}市场${event}节点的3-5个核心卖点，格式：【卖点1】xxx【卖点2】xxx` }]);
          send({ step: 1, status: 'done', msg: '✓ 卖点提取完成', data: sellingPoints });

          // 2号员工：生成图片
          send({ step: 2, status: 'active', msg: '正在合成场景图...' });
          const imageUrl = await generateImage(market, event, sellingPoints);
          send({ step: 2, status: 'done', msg: '✓ 场景图生成完成', data: imageUrl });

          // 3号员工：生成脚本
          send({ step: 3, status: 'active', msg: '正在撰写本地化脚本...' });
          const script = await generateScript(market, platform, event, sellingPoints);
          send({ step: 3, status: 'done', msg: '✓ 双语脚本完成', data: script });

          // 4号员工：生成标签
          send({ step: 4, status: 'active', msg: '正在优化SEO标签...' });
          const tags = await generateTags(market, platform, event, desc);
          send({ step: 4, status: 'done', msg: '✓ 标签生成完毕', data: tags });

          send({ step: 0, status: 'complete' });
        } catch (e: any) {
          send({ step: 0, status: 'error', msg: e.message });
        }

        controller.close();
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      }
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}