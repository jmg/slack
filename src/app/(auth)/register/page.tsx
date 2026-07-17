import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function RegisterPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>Get started with your own Slack-style workspace.</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense>
          <AuthForm mode="register" />
        </Suspense>
      </CardContent>
    </Card>
  );
}
