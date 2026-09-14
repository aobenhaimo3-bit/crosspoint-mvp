export function SourceBadge({ children = "CrossPoint · Demo/Test 数据" }: { children?: React.ReactNode }) {
  return <span className="source-badge"><span aria-hidden="true">◆</span>{children}</span>;
}
