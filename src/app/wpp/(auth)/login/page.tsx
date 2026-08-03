import { Suspense } from "react";
import { WaAuthForm } from "@/components/wpp/wa-auth-form";

export default function WppLoginPage() {
  // Suspense boundary: WaAuthForm reads search params for the post-login `next`.
  return (
    <Suspense>
      <WaAuthForm mode="login" />
    </Suspense>
  );
}
