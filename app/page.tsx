import source from "@/deploy/proof.json";
import Court from "@/components/court";
import type { Proof } from "@/lib/domain";
export default function Page() {
  return <Court proof={source as unknown as Proof} />;
}
