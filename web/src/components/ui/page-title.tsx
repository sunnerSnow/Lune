/** 頁面標題：寬字距英文＋中文小標（h1 用中文，英文只是裝飾） */
export function PageTitle({ en, tc }: { en: string; tc: string }) {
  return (
    <div className="flex items-baseline gap-3 pt-2">
      <span className="ttl-en" aria-hidden="true">
        {en}
      </span>
      <h1 className="ttl-tc">{tc}</h1>
    </div>
  );
}
