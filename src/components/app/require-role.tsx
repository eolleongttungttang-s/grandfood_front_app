"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { UserRole } from "@/lib/auth";
import { useSession } from "@/lib/session";

export function RequireRole({
  role,
  children,
}: {
  role: UserRole;
  children: React.ReactNode;
}) {
  const { account, isLoading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!account) {
      router.replace("/login");
      return;
    }
    if (account.role !== role) {
      router.replace(account.role === "guardian" ? "/guardian/home" : "/user/home");
    }
  }, [account, isLoading, role, router]);

  if (isLoading || !account || account.role !== role) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <>{children}</>;
}
