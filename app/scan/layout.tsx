import { SignalList } from "@/components/SignalList";

export default function ScanLayout({ children }: { children: React.ReactNode }) {
  return <><SignalList mode="scan" /><main className="min-w-0 flex-1">{children}</main></>;
}
