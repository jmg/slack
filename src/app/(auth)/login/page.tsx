import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function LoginPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome back</CardTitle>
        <CardDescription>Sign in to continue to your workspaces.</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense>
          <AuthForm mode="login" />
        </Suspense>
      </CardContent>
    </Card>
  );
}
