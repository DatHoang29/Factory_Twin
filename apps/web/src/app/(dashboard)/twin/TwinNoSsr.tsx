'use client';

import dynamic from 'next/dynamic';

const TwinClient = dynamic(() => import('./TwinClient'), {
  ssr: false,
  loading: () => (
    <div className="min-h-[80vh] flex flex-col items-center justify-center bg-slate-50 text-slate-700 p-8 rounded-3xl border border-slate-100/50">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="font-mono text-xs font-black uppercase tracking-[0.2em] text-slate-800">Đang tải cấu trúc 3D...</p>
        <p className="text-[10px] text-slate-400 mt-2 font-semibold animate-pulse">Vui lòng đợi trong giây lát</p>
      </div>
    </div>
  ),
});

export default function TwinNoSsr() {
  return <TwinClient />;
}