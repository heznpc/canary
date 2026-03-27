"use client";

import { Card, CardContent } from "@/components/ui/card";
import type { DashboardData } from "@/lib/types";
import { Activity, CheckCircle, AlertTriangle, XCircle } from "lucide-react";

export function SummaryCards({ summary }: { summary: DashboardData["summary"] }) {
  const cards = [
    {
      label: "전체 프로젝트",
      value: summary.total,
      icon: Activity,
      className: "text-foreground",
    },
    {
      label: "양호",
      value: summary.healthy,
      icon: CheckCircle,
      className: "text-emerald-600 dark:text-emerald-400",
    },
    {
      label: "업데이트 필요",
      value: summary.needsUpdate,
      icon: AlertTriangle,
      className: "text-amber-600 dark:text-amber-400",
    },
    {
      label: "심각",
      value: summary.critical,
      icon: XCircle,
      className: "text-red-600 dark:text-red-400",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card key={card.label}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{card.label}</p>
                  <p className={`text-3xl font-bold ${card.className}`}>{card.value}</p>
                </div>
                <Icon className={`h-8 w-8 opacity-20 ${card.className}`} />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
