import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { avatarColor, initials } from "@/lib/format";
import { cn } from "@/lib/utils";

export function UserAvatar({
  name,
  image,
  className,
  online,
}: {
  name: string;
  image?: string | null;
  className?: string;
  /** When provided, renders a presence dot (green = online, grey = away). */
  online?: boolean;
}) {
  const avatar = (
    <Avatar className={cn("size-9 rounded-md", className)}>
      {image ? <AvatarImage src={image} alt={name} /> : null}
      <AvatarFallback
        className="rounded-md text-xs font-semibold text-white"
        style={{ backgroundColor: avatarColor(name) }}
      >
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );

  if (online === undefined) return avatar;

  return (
    <span className="relative inline-flex shrink-0">
      {avatar}
      <span
        aria-label={online ? "Online" : "Away"}
        title={online ? "Online" : "Away"}
        className={cn(
          "absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-background",
          online ? "bg-[#2bac76]" : "bg-muted-foreground/50",
        )}
      />
    </span>
  );
}
