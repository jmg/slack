import { Suspense } from "react";
import { WaAuthForm } from "@/components/wpp/wa-auth-form";

export default function WppRegisterPage() {
  return (
    <Suspense>
      <WaAuthForm mode="register" />
    </Suspense>
  );
}
