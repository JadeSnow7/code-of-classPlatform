export type DashboardHeatmapCell = {
  date: string;
  hours: number;
};

export type DashboardWritingRadar = {
  逻辑性?: number;
  创造力?: number;
  深度?: number;
  表达清晰度?: number;
  引用规范?: number;
  原创性?: number;
} & Record<string, number | undefined>;

export type DashboardSummary = {
  activity_heatmap: DashboardHeatmapCell[];
  knowledge_bases_count: number;
  pending_assignments_count: number;
  writing_radar?: DashboardWritingRadar;
};
