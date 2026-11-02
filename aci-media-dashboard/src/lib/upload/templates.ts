export type UploadKind = "plan" | "spend" | "performance" | "digital" | "competitor_media" | "bills";
export type ColumnType = "string" | "number" | "date" | "month";
export type ColumnDef = { key: string; header: string; type: ColumnType; required: boolean };
export type TemplateDef = {
  kind: UploadKind;
  title: string;
  fileName: string;
  columns: ColumnDef[];
  totalKey: string | null;
  periodKey: string;
};

const col = (key: string, header: string, type: ColumnType, required = false): ColumnDef => ({ key, header, type, required });

export const TEMPLATES: Record<UploadKind, TemplateDef> = {
  plan: {
    kind: "plan",
    title: "Campaign plan",
    fileName: "aci-plan-template.xlsx",
    columns: [
      col("campaign", "Campaign", "string", true),
      col("brand", "Brand", "string", true),
      col("startDate", "Start date", "date", true),
      col("endDate", "End date", "date", true),
      col("status", "Status", "string"),
      col("channel", "Channel", "string", true),
      col("plannedAmount", "Planned amount (BDT, with VAT)", "number", true),
      col("notes", "Notes", "string"),
    ],
    totalKey: "plannedAmount",
    periodKey: "startDate",
  },
  spend: {
    kind: "spend",
    title: "Media spend",
    fileName: "aci-spend-template.xlsx",
    columns: [
      col("month", "Month", "month", true),
      col("entryDate", "Date", "date"),
      col("brand", "Brand", "string", true),
      col("channel", "Channel", "string", true),
      col("tvStation", "TV station", "string"),
      col("vendor", "Agency or vendor", "string"),
      col("amount", "Amount (BDT, with VAT)", "number", true),
      col("note", "Note", "string"),
    ],
    totalKey: "amount",
    periodKey: "month",
  },
  performance: {
    kind: "performance",
    title: "Channel performance",
    fileName: "aci-performance-template.xlsx",
    columns: [
      col("month", "Month", "month", true),
      col("brand", "Brand", "string", true),
      col("channel", "Channel", "string", true),
      col("spend", "Spend (BDT, with VAT)", "number", true),
      col("peopleReached", "People reached", "number"),
      col("grp", "GRP", "number"),
      col("shareOfVoice", "Share of voice %", "number"),
      col("shareOfSpend", "Share of spend %", "number"),
      col("reach1Plus", "1+ reach %", "number"),
      col("cprp", "Cost per rating point", "number"),
    ],
    totalKey: "spend",
    periodKey: "month",
  },
  digital: {
    kind: "digital",
    title: "Digital results",
    fileName: "aci-digital-template.xlsx",
    columns: [
      col("month", "Month", "month", true),
      col("brand", "Brand", "string", true),
      col("platform", "Platform", "string", true),
      col("spend", "Spend (BDT, with VAT)", "number"),
      col("reach", "Reach", "number"),
      col("impressions", "Impressions", "number"),
      col("cpm", "CPM", "number"),
      col("thruplays", "ThruPlays", "number"),
      col("costPerView", "Cost per view", "number"),
      col("engagement", "Post engagement", "number"),
    ],
    totalKey: "spend",
    periodKey: "month",
  },
  competitor_media: {
    kind: "competitor_media",
    title: "Competitor TV, Press and Radio",
    fileName: "aci-competitor-media-template.xlsx",
    columns: [
      col("month", "Month", "month", true),
      col("brand", "Brand", "string", true),
      col("subject", "Brand or rival name", "string", true),
      col("media", "Media (TV, Press, Radio)", "string", true),
      col("spend", "Spend (BDT)", "number"),
      col("spots", "Spots or insertions", "number"),
      col("shareOfVoice", "Share of voice %", "number"),
    ],
    totalKey: "spend",
    periodKey: "month",
  },
  bills: {
    kind: "bills",
    title: "Media bills",
    fileName: "aci-bills-template.xlsx",
    columns: [
      col("billNo", "Bill no", "string", true),
      col("poNo", "PO no", "string"),
      col("vendor", "Vendor", "string"),
      col("brand", "Brand", "string"),
      col("month", "Month", "month", true),
      col("billDate", "Bill date", "date", true),
      col("amount", "Amount (BDT, with VAT)", "number", true),
      col("vatAmount", "VAT amount (BDT)", "number"),
      col("status", "Status", "string"),
      col("paidOn", "Paid on", "date"),
      col("note", "Note", "string"),
    ],
    totalKey: "amount",
    periodKey: "month",
  },
};

export const UPLOAD_KINDS = Object.keys(TEMPLATES) as UploadKind[];
