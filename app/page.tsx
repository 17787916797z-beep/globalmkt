'use client';
import { useState, useRef } from 'react';

export default function Home() {
  const [market, setMarket] = useState('马来西亚');
  const [platform, setPlatform] = useState('TikTok');
  const [event, setEvent] = useState('开斋节大促');
  const [desc, setDesc] = useState('');
  const [imageBase64, setImageBase64] = useState('');
  const [imageMime, setImageMime] = useState('image/jpeg');
  const [steps, setSteps] = useState([0,0,0,0]); // 0=待机 1=运行 2=完成
  const [results, setResults] = useState<any>({});
  const [loading, setLoading] = useState(false);

  // 图片上传处理
  const handleFile = (file: File) => {
    setImageMime(file.type);
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = (e.target?.result as string).split(',')[1];
      setImageBase64(base64);
    };
    reader.readAsDataURL(file);
  };

  // 核心：调用后端，读取SSE流
  const generate = async () => {
    if (!imageBase64) {
      alert("请先上传一张图片！");
      return;
    }
    
    setLoading(true);
    setResults({});
    setSteps([0,0,0,0]);

    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64, imageMime, market, platform, event, desc }),
    });

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value);
      const lines = text.split('\n').filter(l => l.startsWith('data:'));

      for (const line of lines) {
        const payload = JSON.parse(line.replace('data: ', ''));
        const { step, status, data } = payload;

        if (status === 'active') {
          setSteps(prev => { const s=[...prev]; s[step-1]=1; return s; });
        } else if (status === 'done') {
          setSteps(prev => { const s=[...prev]; s[step-1]=2; return s; });
          setResults((prev: any) => ({ ...prev, [`step${step}`]: data }));
        } else if (status === 'complete') {
          setLoading(false);
        }
      }
    }
  };

  // ... 下面是我为你补全的UI渲染部分 ...
  return (
    <div className="min-h-screen bg-gray-50 p-8 font-sans">
      <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* 左侧控制台 */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h1 className="text-2xl font-bold mb-6 text-gray-800">AI 营销大模型引擎</h1>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">上传参考图</label>
              <input type="file" accept="image/*" onChange={(e) => { if(e.target.files?.[0]) handleFile(e.target.files[0]) }} className="w-full border p-2 rounded bg-gray-50" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">目标市场</label>
                <input type="text" value={market} onChange={e => setMarket(e.target.value)} className="w-full border p-2 rounded" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">发布平台</label>
                <input type="text" value={platform} onChange={e => setPlatform(e.target.value)} className="w-full border p-2 rounded" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">营销节点</label>
              <input type="text" value={event} onChange={e => setEvent(e.target.value)} className="w-full border p-2 rounded" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">补充说明 (选填)</label>
              <textarea value={desc} onChange={e => setDesc(e.target.value)} className="w-full border p-2 rounded h-20" placeholder="例如：突出产品性价比高..." />
            </div>
            
            <button onClick={generate} disabled={loading} className="w-full bg-black text-white font-bold py-3 rounded-lg hover:bg-gray-800 disabled:bg-gray-400 transition-colors mt-4">
              {loading ? 'AI 引擎全速运转中...' : '一键生成营销全案'}
            </button>
          </div>
        </div>

        {/* 右侧结果区 */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-6">
          <h2 className="text-xl font-bold border-b pb-4 text-gray-800">生成结果</h2>
          
          {/* 步骤条指示器 */}
          <div className="flex justify-between text-sm mb-6 text-gray-500">
             <span className={steps[0] > 0 ? (steps[0] === 2 ? 'text-green-600 font-bold' : 'text-blue-600 font-bold animate-pulse') : ''}>1. 提炼卖点</span>
             <span className={steps[1] > 0 ? (steps[1] === 2 ? 'text-green-600 font-bold' : 'text-blue-600 font-bold animate-pulse') : ''}>2. 绘图</span>
             <span className={steps[2] > 0 ? (steps[2] === 2 ? 'text-green-600 font-bold' : 'text-blue-600 font-bold animate-pulse') : ''}>3. 写文案</span>
             <span className={steps[3] > 0 ? (steps[3] === 2 ? 'text-green-600 font-bold' : 'text-blue-600 font-bold animate-pulse') : ''}>4. 配标签</span>
          </div>

          <div className="space-y-4">
            {/* 1. 卖点 */}
            {results.step1 && (
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-bold text-sm text-gray-800 mb-2">💡 核心卖点</h3>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{results.step1}</p>
              </div>
            )}
            
            {/* 2. 图片 */}
            {results.step2 && (
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-bold text-sm text-gray-800 mb-2">🖼️ 营销海报</h3>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={results.step2} alt="AI生成的海报" className="w-full rounded border border-gray-200" />
              </div>
            )}

            {/* 3. 文案 */}
            {results.step3 && (
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-bold text-sm text-gray-800 mb-2">✍️ {platform} 专属文案</h3>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{results.step3}</p>
              </div>
            )}

            {/* 4. 标签 */}
            {results.step4 && (
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-bold text-sm text-gray-800 mb-2">🏷️ 流量标签</h3>
                <p className="text-sm text-blue-600 whitespace-pre-wrap font-medium">{results.step4}</p>
              </div>
            )}

            {!loading && !results.step1 && (
              <div className="text-center text-gray-400 py-10">
                请在左侧上传商品图并点击生成
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}