"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { Ward, WardStatus } from "@/lib/wards";
import { Badge } from "@/components/ui/badge";
import { TopBar } from "@/components/app/top-bar";

const STATUS_BADGE_CLASS: Record<WardStatus, string> = {
  "확인 필요": "bg-risk-high text-risk-high-foreground",
  관찰중: "bg-risk-caution text-risk-caution-foreground",
  양호: "bg-risk-normal text-risk-normal-foreground",
};

export function WardListView({ name, wards }: { name: string; wards: Ward[] }) {
  const needsAttention = wards.filter((w) => w.status === "확인 필요").length;

  return (
    <div className="flex flex-1 flex-col gap-4 pb-6">
      <TopBar title={`${name}님, 안녕하세요`} subtitle="돌보고 계신 대상자" />

      <div className="flex flex-col gap-4 px-5">
        <div className="grid grid-cols-2 gap-2.5">
          <div className="flex flex-col gap-1 rounded-xl bg-muted px-4 py-3">
            <span className="text-xs font-medium text-muted-foreground">
              전체 대상자
            </span>
            <span className="text-xl font-extrabold text-foreground">
              {wards.length}명
            </span>
          </div>
          <div className="flex flex-col gap-1 rounded-xl bg-muted px-4 py-3">
            <span className="text-xs font-medium text-muted-foreground">
              확인이 필요해요
            </span>
            <span className="text-xl font-extrabold text-destructive">
              {needsAttention}명
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {wards.map((ward) => (
            <Link
              key={ward.id}
              href={`/guardian/wards/${ward.id}`}
              className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-base font-extrabold text-muted-foreground">
                  {ward.name.slice(0, 1)}
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-foreground">
                      {ward.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ({ward.relationToGuardian})
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {ward.lastMeal.label}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge className={STATUS_BADGE_CLASS[ward.status]}>
                  {ward.status}
                </Badge>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
