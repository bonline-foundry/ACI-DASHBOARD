import { TEMPLATES, UPLOAD_KINDS, type UploadKind } from "@/lib/upload/templates";
import { buildTemplate } from "@/lib/upload/build-template";

export async function GET(_req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!UPLOAD_KINDS.includes(kind as UploadKind)) return new Response("Unknown template", { status: 404 });
  const def = TEMPLATES[kind as UploadKind];
  return new Response(Buffer.from(buildTemplate(def.kind)), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${def.fileName}"`,
    },
  });
}
