import { BookOpen } from "lucide-react";
import { ComingSoon } from "@/components/shared/coming-soon";

export default function WikiPage() {
  return (
    <ComingSoon
      title="Wiki"
      description="Documentation and knowledge base"
      icon={BookOpen}
    />
  );
}
