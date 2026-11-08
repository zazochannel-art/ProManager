import type { Metadata } from "next";
import { PlannedModule } from "@/features/modules/components/planned-module";

export const metadata: Metadata = { title: "Expenses" };

export default function Page() {
  return <PlannedModule moduleKey="expenses" />;
}
