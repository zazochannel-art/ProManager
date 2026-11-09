"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n/client";
import { interpolate } from "@/lib/i18n";
import { TaskForm } from "@/features/tasks/components/task-form";
import { TaskList, type TaskRow } from "@/features/tasks/components/task-list";

export type { TaskRow };

export function ProjectTasks({
  projectId,
  tasks,
  members,
  currentUserId,
  canManage,
  canUpdateAssigned,
  today,
}: {
  projectId: string;
  tasks: TaskRow[];
  members: { userId: string; name: string }[];
  currentUserId: string;
  canManage: boolean;
  canUpdateAssigned: boolean;
  today?: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const done = tasks.filter((task) => task.status === "done").length;
  const open = tasks.filter((task) => task.status !== "cancelled").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.tasks.title}</CardTitle>
        {open > 0 ? <CardDescription>{interpolate(t.tasks.progress, { done, total: open })}</CardDescription> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {canManage ? (
          <TaskForm
            className="rounded-md bg-muted/40 p-3"
            projectId={projectId}
            members={members}
            onSuccess={() => {
              toast.success(t.tasks.added);
              router.refresh();
            }}
          />
        ) : null}
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.tasks.empty}</p>
        ) : (
          <TaskList tasks={tasks} members={members} currentUserId={currentUserId} canManage={canManage} canUpdateAssigned={canUpdateAssigned} today={today} />
        )}
      </CardContent>
    </Card>
  );
}
