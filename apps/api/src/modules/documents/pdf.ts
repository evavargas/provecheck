import { Document, Image, Page, renderToBuffer, StyleSheet, Text, View } from '@react-pdf/renderer';
import { formatDateTime, type ReportContent } from '@provecheck/shared';
import { createElement as h, type ReactNode } from 'react';

export interface PdfData {
  taskShortId: string;
  orgName: string;
  locale: 'es-UY' | 'en';
  timezone: string;
  /** PNG or JPEG bytes of the organization's logo, when it uploaded one. */
  logo: { data: Buffer; format: 'png' | 'jpg' } | null;
  recipient: string;
  address: string;
  serviceType: string | null;
  recipientName: string | null;
  scheduledStartAt: string;
  completedAt: string;
  objectionDeadlineAt: string;
  generatedAt: string;
  shortHash: string;
  team: { name: string; arrivedAt: string | null; delayed: boolean }[];
  content: ReportContent;
  /** JPEG bytes at 1024 px, already in display order (RN-16). */
  photos: Buffer[];
}

const T = {
  'es-UY': {
    title: 'Registro de servicio',
    task: 'Tarea',
    client: 'Cliente',
    address: 'Dirección',
    service: 'Tipo de servicio',
    receives: 'Recibió',
    scheduled: 'Inicio pautado',
    completed: 'Finalización',
    team: 'Colaboradores',
    arrival: 'Llegada',
    delayed: 'Demora en atender',
    yes: 'Sí',
    no: 'No',
    none: 'Sin registro',
    description: 'Descripción del servicio realizado',
    photos: 'Evidencia fotográfica',
    generated: 'Generado',
    deadline: 'Plazo de descargos hasta',
    doc: 'Documento',
    page: 'Página',
  },
  en: {
    title: 'Service record',
    task: 'Task',
    client: 'Client',
    address: 'Address',
    service: 'Service type',
    receives: 'Received by',
    scheduled: 'Scheduled start',
    completed: 'Completed',
    team: 'Collaborators',
    arrival: 'Arrival',
    delayed: 'Kept waiting',
    yes: 'Yes',
    no: 'No',
    none: 'No record',
    description: 'Description of the service performed',
    photos: 'Photo evidence',
    generated: 'Generated',
    deadline: 'Objections accepted until',
    doc: 'Document',
    page: 'Page',
  },
} as const;

const ink = '#1B2528';
const muted = '#5C6B70';
const primary = '#0F4C5C';
const s = StyleSheet.create({
  page: { padding: 40, paddingBottom: 60, fontFamily: 'Helvetica', fontSize: 10, color: ink },
  head: { borderBottomWidth: 2, borderBottomColor: primary, paddingBottom: 10, marginBottom: 14 },
  org: { fontSize: 11, color: muted },
  logo: { height: 44, objectFit: 'contain', objectPosition: 'left', marginBottom: 6 },
  title: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: primary },
  row: { flexDirection: 'row', marginBottom: 4 },
  label: { width: 110, color: muted },
  value: { flex: 1 },
  h2: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: primary,
    marginTop: 14,
    marginBottom: 6,
  },
  cell: { flex: 1 },
  bold: { fontFamily: 'Helvetica-Bold' },
  para: { marginBottom: 5, lineHeight: 1.4 },
  bullet: { flexDirection: 'row', marginBottom: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photo: { width: '48.5%' },
  photoImg: { width: '100%', height: 190, objectFit: 'contain', backgroundColor: '#F6F8F9' },
  photoNo: { fontSize: 8, color: muted, marginTop: 2 },
  foot: {
    position: 'absolute',
    left: 40,
    right: 40,
    bottom: 24,
    fontSize: 8,
    color: muted,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#D9E1E4',
    paddingTop: 6,
  },
});

type Segs = ReportContent['blocks'][number] extends infer B
  ? B extends { content: infer C }
    ? C
    : never
  : never;
const spans = (segs: Segs): ReactNode[] =>
  segs.map((x, i) => h(Text, { key: i, style: x.bold ? s.bold : {} }, x.text));

export function renderTaskPdf(d: PdfData): Promise<Buffer> {
  const t = T[d.locale];
  const f = (iso: string) => formatDateTime(iso, d.locale, d.timezone);
  const line = (label: string, value: string | null) =>
    value
      ? h(
          View,
          { style: s.row, key: label },
          h(Text, { style: s.label }, label),
          h(Text, { style: s.value }, value),
        )
      : null;

  const doc = h(
    Document,
    { title: `${t.title} ${d.taskShortId}` },
    h(
      Page,
      { size: 'A4', style: s.page, wrap: true },
      h(
        View,
        { style: s.head },
        h(Text, { style: s.org }, d.orgName),
        h(Text, { style: s.title }, t.title),
        h(Text, { style: s.org }, `${t.task} ${d.taskShortId}`),
      ),
      line(t.client, d.recipient),
      line(t.address, d.address),
      line(t.service, d.serviceType),
      line(t.receives, d.recipientName),
      line(t.scheduled, f(d.scheduledStartAt)),
      line(t.completed, f(d.completedAt)),
      h(Text, { style: s.h2 }, t.team),
      ...d.team.map((m) =>
        h(
          View,
          { style: s.row, key: m.name, wrap: false },
          h(Text, { style: [s.cell, s.bold] }, m.name),
          h(Text, { style: s.cell }, `${t.arrival}: ${m.arrivedAt ? f(m.arrivedAt) : t.none}`),
          h(Text, { style: s.cell }, `${t.delayed}: ${m.delayed ? t.yes : t.no}`),
        ),
      ),
      h(Text, { style: s.h2 }, t.description),
      ...d.content.blocks.map((b, i) =>
        b.type === 'paragraph'
          ? h(Text, { key: i, style: s.para }, ...spans(b.content))
          : h(
              View,
              { key: i, style: { marginBottom: 5 } },
              ...b.items.map((item, j) =>
                h(
                  View,
                  { key: j, style: s.bullet },
                  h(Text, null, '•  '),
                  h(Text, { style: { flex: 1 } }, ...spans(item)),
                ),
              ),
            ),
      ),
      d.photos.length
        ? h(
            View,
            null,
            h(Text, { style: s.h2 }, t.photos),
            h(
              View,
              { style: s.grid },
              ...d.photos.map((data, i) =>
                h(
                  View,
                  { key: i, style: s.photo, wrap: false },
                  h(Image, { src: { data, format: 'jpg' }, style: s.photoImg }),
                  h(Text, { style: s.photoNo }, String(i + 1)),
                ),
              ),
            ),
          )
        : null,
      h(
        View,
        { style: s.foot, fixed: true },
        h(
          Text,
          null,
          `${t.generated} ${f(d.generatedAt)} · ${t.deadline} ${f(d.objectionDeadlineAt)}`,
        ),
        h(Text, null, `${t.doc} ${d.shortHash}`),
        h(Text, {
          render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
            `${t.page} ${pageNumber}/${totalPages}`,
        }),
      ),
    ),
  );
  return renderToBuffer(doc);
}
