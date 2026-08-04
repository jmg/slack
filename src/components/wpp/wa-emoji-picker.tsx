"use client";

import { isValidElement, useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { Smile } from "lucide-react";
import { useT } from "@/components/wpp/i18n-provider";
import { QUICK_REACTIONS } from "@/lib/wpp/config";
import type { WppKey } from "@/lib/wpp/i18n";

/**
 * The catalogue, hand-written and frozen into the bundle.
 *
 * No emoji library: every one of them ships either a multi-hundred-kilobyte
 * index of names, keywords and skin-tone variants, or a sprite sheet fetched at
 * runtime — both a poor trade for a picker that only ever needs the couple of
 * hundred characters people actually send. These are plain strings rendered by
 * the system font, so they also match whatever the user's OS draws elsewhere.
 *
 * Order inside each group is WhatsApp's: most-used first, not codepoint order.
 */
const EMOJI_GROUPS: ReadonlyArray<{ key: WppKey; emoji: readonly string[] }> = [
  {
    key: "emoji.smileys",
    emoji: [
      "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂",
      "🙂", "🙃", "😉", "😊", "😇", "🥰", "😍", "😘",
      "😋", "😛", "😜", "🤪", "🤗", "🤭", "🤔", "😐",
      "😌", "😔", "😢", "😭", "😤", "😠", "😡", "🤯",
      "😳", "🥵", "😱", "🥳", "😎", "🤓", "😴", "🤒",
    ],
  },
  {
    key: "emoji.gestures",
    emoji: [
      "👍", "👎", "👌", "🤌", "✌️", "🤞", "🤟", "🤘",
      "🤙", "👈", "👉", "👆", "👇", "☝️", "✋", "🖐️",
      "👋", "🤝", "🙏", "💪", "🫶", "👏", "🙌", "🤲",
    ],
  },
  {
    key: "emoji.nature",
    emoji: [
      "🐶", "🐱", "🐭", "🐰", "🦊", "🐻", "🐼", "🐨",
      "🦁", "🐮", "🐷", "🐸", "🐵", "🐔", "🐧", "🦋",
      "🌸", "🌻", "🌳", "🌵", "🌈", "⭐", "🌙", "☀️",
      "☁️", "❄️", "🔥", "💧", "🌊", "🍀",
    ],
  },
  {
    key: "emoji.food",
    emoji: [
      "🍎", "🍐", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓",
      "🍒", "🥭", "🥑", "🍅", "🌽", "🥕", "🍞", "🧀",
      "🍔", "🍟", "🍕", "🌮", "🍿", "🍩", "🍪", "🎂",
      "🍫", "🍬", "☕", "🍺", "🍷", "🥂",
    ],
  },
  {
    key: "emoji.activities",
    emoji: [
      "⚽", "🏀", "🏈", "🎾", "🏐", "🏓", "🥊", "🏆",
      "🥇", "🎯", "🎮", "🎲", "🎸", "🎹", "🎤", "🎧",
      "🎬", "📷", "💻", "📱", "⌚", "💡", "🔑", "📚",
      "✏️", "📌", "💼", "🎁", "🎉", "🎈",
    ],
  },
  {
    key: "emoji.symbols",
    emoji: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍",
      "💔", "💖", "💗", "💓", "💞", "💕", "💘", "💌",
      "💯", "✅", "❌", "❗", "❓", "⚠️", "🔔", "🔕",
      "♻️", "🔴", "🟢", "🔵", "⚫", "⚪",
    ],
  },
];

/**
 * Emoji picker for the composer and the reaction bar.
 *
 * Built on Popover rather than the DropdownMenu primitive on purpose: a menu
 * owns arrow-key focus and type-ahead so that letters jump between items, which
 * is exactly wrong for a 200-cell grid of pictographs. A popover leaves the
 * buttons as ordinary tab stops and lets the browser do the right thing.
 */
export function WaEmojiPicker({
  onPick,
  children,
  side = "top",
  align = "start",
}: {
  onPick: (emoji: string) => void;
  /** Rendered as the trigger. Defaults to a smiley icon button. */
  children?: React.ReactNode;
  side?: "top" | "bottom";
  align?: "start" | "center" | "end";
}): React.ReactElement {
  const t = useT();
  const [open, setOpen] = useState(false);

  function pick(emoji: string) {
    onPick(emoji);
    // Closing after one pick matches WhatsApp; picking a run of emoji is what
    // the keyboard is for.
    setOpen(false);
  }

  const cell =
    "flex size-9 items-center justify-center rounded-md text-xl leading-none hover:bg-[var(--wa-hover)] focus-visible:bg-[var(--wa-hover)] focus-visible:outline-none";

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      {/* A caller that hands us a single element gets it used *as* the trigger,
          so a custom button doesn't end up nested inside ours. */}
      {isValidElement(children) ? (
        <Popover.Trigger render={children} />
      ) : (
        <Popover.Trigger
          render={
            <button
              type="button"
              aria-label={t("composer.emoji")}
              className="flex size-9 shrink-0 items-center justify-center rounded-full text-[var(--wa-text-dim)] hover:bg-[var(--wa-hover)] focus-visible:bg-[var(--wa-hover)] focus-visible:outline-none"
            />
          }
        >
          {children ?? <Smile className="size-6" />}
        </Popover.Trigger>
      )}

      <Popover.Portal>
        <Popover.Positioner side={side} align={align} sideOffset={8} className="z-50">
          <Popover.Popup className="w-[336px] origin-(--transform-origin) rounded-xl bg-[var(--wa-panel)] shadow-lg ring-1 ring-[var(--wa-border)] outline-none">
            {/* Fixed height, not max-height: the picker must not resize as the
                user scrolls between groups of different sizes. */}
            <div className="wa-scroll h-64 overflow-y-auto p-2">
              <Section label={t("emoji.quick")}>
                {QUICK_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    aria-label={emoji}
                    onClick={() => pick(emoji)}
                    className={cell}
                  >
                    {emoji}
                  </button>
                ))}
              </Section>

              {EMOJI_GROUPS.map((group) => (
                <Section key={group.key} label={t(group.key)}>
                  {group.emoji.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      aria-label={emoji}
                      onClick={() => pick(emoji)}
                      className={cell}
                    >
                      {emoji}
                    </button>
                  ))}
                </Section>
              ))}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * Sticky headings rather than tabs: they cost no state, and scrolling past one
 * still tells you which group you are in — which is the only thing tabs would
 * have bought here.
 */
function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="sticky top-0 z-10 bg-[var(--wa-panel)] px-1 py-1.5 text-[11px] font-medium tracking-wide text-[var(--wa-text-dim)] uppercase">
        {label}
      </h3>
      <div className="grid grid-cols-8">{children}</div>
    </section>
  );
}
