import { SignalList } from "@/components/SignalList";

export default function ShortlistLayout({ children }: { children: React.ReactNode }) {
  return <><SignalList mode="shortlist" /><main className="min-w-0 flex-1">{children}</main></>;
}
