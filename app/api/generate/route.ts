import { NextRequest, NextResponse } from 'next/server';

const ZHIPU_KEY = process.env.ZHIPU_API_KEY!;
const BASE_URL = 'https://open.bigmodel.cn/api/paas/v4';

// 🛡️ 新增：保安的“记事本” - 简单限流：每个IP每天最多20次
const ipCount = new Map<string, {count: number, date: string}>();

// 通用文本调用函数
async function callGLM(messages: any[], model = 'glm-4-flash') {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ZHIPU_KEY}`,
    },
    body: JSON.stringify({ model, messages }),
  });
  const data = await res.json();
  
  if (data.error) {
    throw new Error(`AI文本接口报错: ${data.error.message}`);
  }
  if (!data.choices || data.choices.length === 0) {
    throw new Error(`AI返回格式异常，没有找到 choices: ${JSON.stringify(data)}`);
  }
  
  return data.choices[0].message.content as string;
}

// 图像理解（带图片）
async function analyzeImage(imageBase64: string, mime: string, market: string, event: string, desc: string) {
  const safeImageUrl = imageBase64.startsWith('data:') 
    ? imageBase64 
    : `data:${mime};base64,${imageBase64}`;

  return callGLM([{
    role: 'user',
    content: [
      { type: 'image_url', image_url: { url: safeImageUrl } },
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
  
  if (data.error) {
    throw new Error(`AI画图接口报错: ${data.error.message}`);
  }
  if (!data.data || data.data.length === 0) {
    throw new Error(`AI画图返回异常，没有找到图片URL: ${JSON.stringify(data)}`);
  }

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
  // 🛡️ 新增：限流逻辑开始（必须放在调用 AI 之前）
  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  const today = new Date().toDateString();
  const record = ipCount.get(ip);

  if (record && record.date === today && record.count >= 20) {
    // 发现刷子！直接返回 429 报错，拒绝服务，保护你的钱包！
    return NextResponse.json({ error: '今日免费生成次数已达上限（20次），请明天再来体验哦！' }, { status: 429 });
  }
  // 没超限，给这位客人的今日记录本上 +1 次
  ipCount.set(ip, { count: (record?.date === today ? record.count : 0) + 1, date: today });
  // 🛡️ 新增：限流逻辑结束

  try {
    const body = await req.json();
    const { imageBase64, imageMime, market, platform, event, desc } = body;

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