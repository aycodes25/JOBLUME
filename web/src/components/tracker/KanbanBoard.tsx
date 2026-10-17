'use client';

import {
  DndContext, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import { KANBAN_COLUMNS, type Application, type ApplicationStatus, type KanbanColumn } from '@joblume/shared';
import { useMemo } from 'react';
import { ScoreRing } from '@/components/applications/ScoreRing';
import { Badge } from '@/components/ui/badge';
import { groupByColumn, resolveDrop } from '@/lib/applications';
import { COLUMN_LABELS, formatShortDate } from '@/lib/format';
import { MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface KanbanBoardProps {
  apps: Application[];
  onMove(id: string, status: ApplicationStatus): void;
  onOpen(id: string): void;
}

function DraggableCard({ app, onOpen }: { app: Application; onOpen(id: string): void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: app.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  const applied = formatShortDate(app.applied_at);
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn('cursor-grab touch-none rounded-xl border border-border/70 bg-card p-3 text-sm shadow-card', isDragging && 'relative z-10 opacity-80 shadow-lg')}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-sm font-semibold uppercase text-primary" aria-hidden="true">
          {(app.job?.company ?? '?').charAt(0)}
        </span>
        <div className="min-w-0 flex-1">
          <button type="button" className="text-left font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onOpen(app.id)} onKeyDown={(e) => e.stopPropagation()}>
            {app.job?.title ?? 'Untitled role'}
          </button>
          <p className="truncate text-xs text-muted-foreground">{app.job?.company ?? 'Unknown company'}</p>
        </div>
        <ScoreRing score={app.match_score} size={32} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-dashed border-border pt-2 text-xs text-muted-foreground">
        {app.job?.location && (
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" aria-hidden="true" />
            {app.job.location}
          </span>
        )}
        {app.status === 'approved' && <Badge variant="success">Ready to apply</Badge>}
        {applied && <span>Applied {applied}</span>}
      </div>
    </div>
  );
}

function Column({ column, apps, onOpen }: { column: KanbanColumn; apps: Application[]; onOpen(id: string): void }) {
  const { setNodeRef, isOver } = useDroppable({ id: column });
  return (
    <section
      aria-label={COLUMN_LABELS[column]}
      ref={setNodeRef}
      className={cn('flex w-[82vw] max-w-72 shrink-0 snap-start flex-col gap-3 self-start rounded-xl border border-border/70 bg-secondary/60 p-3 sm:w-72', isOver && 'border-primary')}
    >
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{COLUMN_LABELS[column]}</h2>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs text-muted-foreground shadow-sm" aria-label={`${apps.length} applications`}>
          {apps.length}
        </span>
      </header>
      {apps.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">Drop a card here</p>}
      {apps.map((app) => (
        <DraggableCard key={app.id} app={app} onOpen={onOpen} />
      ))}
    </section>
  );
}

export function KanbanBoard({ apps, onMove, onOpen }: KanbanBoardProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  const groups = useMemo(() => groupByColumn(apps), [apps]);

  function handleDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id);
    const status = resolveDrop(apps, activeId, event.over ? String(event.over.id) : null);
    if (status) onMove(activeId, status);
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex snap-x gap-4 overflow-x-auto pb-4">
        {KANBAN_COLUMNS.map((column) => (
          <Column key={column} column={column} apps={groups[column]} onOpen={onOpen} />
        ))}
      </div>
    </DndContext>
  );
}
