"use client";

import useSWR from "swr";
import { Check, CheckCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WaAvatar } from "@/components/wpp/wa-avatar";
import { useT, useWppLocale } from "@/components/wpp/i18n-provider";
import { WPP_API } from "@/lib/wpp/config";
import { formatListTimestamp, formatTime } from "@/lib/wpp/format";
import type { WaMessageInfo } from "@/lib/wpp/types";

/**
 * WhatsApp's "Message info": who has your message, and who has read it.
 *
 * Sender-only, and the server enforces that — this dialog is just the view.
 * Someone missing from both lists hasn't received it yet, which is why they are
 * simply absent rather than listed under a third heading.
 */
export function MessageInfoDialog({
  messageId,
  onClose,
}: {
  messageId: string | null;
  onClose: () => void;
}) {
  const t = useT();
  const locale = useWppLocale();

  const { data, isLoading } = useSWR<WaMessageInfo>(
    messageId ? `${WPP_API}/messages/${messageId}/info` : null,
  );

  return (
    <Dialog open={messageId != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("message.info")}</DialogTitle>
        </DialogHeader>

        {isLoading || !data ? (
          <p className="py-6 text-center text-sm text-[var(--wa-text-dim)]">
            {t("common.loading")}
          </p>
        ) : (
          <div className="wa-scroll flex max-h-80 flex-col gap-4 overflow-y-auto">
            <Section
              icon={<CheckCheck className="size-4 text-[var(--wa-tick-read)]" />}
              title={t("message.readBy")}
              people={data.read}
              locale={locale}
              empty={t("status.noViewers")}
            />
            <Section
              icon={<CheckCheck className="size-4 text-[var(--wa-tick)]" />}
              title={t("message.deliveredTo")}
              people={data.delivered}
              locale={locale}
              empty={t("status.noViewers")}
            />
            <p className="flex items-center gap-1.5 border-t border-[var(--wa-border)] pt-3 text-xs text-[var(--wa-text-dim)]">
              <Check className="size-3.5" />
              {formatListTimestamp(data.createdAt, locale, t)}{" "}
              {formatTime(data.createdAt, locale)}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Section({
  icon,
  title,
  people,
  locale,
  empty,
}: {
  icon: React.ReactNode;
  title: string;
  people: WaMessageInfo["read"];
  locale: ReturnType<typeof useWppLocale>;
  empty: string;
}) {
  const t = useT();
  return (
    <section className="flex flex-col gap-2">
      <h3 className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-[var(--wa-text-dim)] uppercase">
        {icon}
        {title}
      </h3>
      {people.length === 0 ? (
        <p className="text-sm text-[var(--wa-text-dim)]">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {people.map((person) => (
            <li key={person.id} className="flex items-center gap-3">
              <WaAvatar name={person.name} avatarUrl={person.avatarUrl} size={32} />
              <span className="min-w-0 flex-1 truncate text-sm text-[var(--wa-text)]">
                {person.name || t("common.deletedAccount")}
              </span>
              <span className="shrink-0 text-xs text-[var(--wa-text-dim)]">
                {formatTime(person.at, locale)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
