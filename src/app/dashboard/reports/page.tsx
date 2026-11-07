import type { Metadata } from "next";
import { PlannedModule } from "@/features/modules/components/planned-module";

export const metadata: Metadata = { title: "Reports" };

export default function Page() {
  return <PlannedModule moduleKey="reports" />;
}
