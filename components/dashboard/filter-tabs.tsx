"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface FilterTabsProps {
  value: string;
  onChange: (value: string) => void;
}

export function FilterTabs({ value, onChange }: FilterTabsProps) {
  return (
    <Tabs value={value} onValueChange={onChange}>
      <TabsList>
        <TabsTrigger value="all">전체</TabsTrigger>
        <TabsTrigger value="app">서비스</TabsTrigger>
        <TabsTrigger value="paper">연구</TabsTrigger>
        <TabsTrigger value="mcp">MCP</TabsTrigger>
        <TabsTrigger value="needs-attention">조치 필요</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
