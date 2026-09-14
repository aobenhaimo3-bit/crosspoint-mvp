import type { SVGProps } from "react";

export function ArrowIcon(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}><path d="M4 10h11m-4-4 4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
export function CrossMark(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 28 28" fill="none" aria-hidden="true" {...props}><path d="M3 14h22M14 3v22" stroke="currentColor" strokeWidth="1.5"/><rect x="10" y="10" width="8" height="8" rx="1" fill="currentColor"/></svg>;
}
export function PeopleIcon(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}><circle cx="7" cy="7" r="3" stroke="currentColor"/><circle cx="14.5" cy="8" r="2.2" stroke="currentColor"/><path d="M2.5 17c.3-3.2 2-5 4.5-5s4.2 1.8 4.5 5M12 13c2.8-.7 4.8.8 5.2 3.5" stroke="currentColor" strokeLinecap="round"/></svg>;
}
