import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { avatarColor, initials } from "@/lib/format";
import { cn } from "@/lib/utils";

export function UserAvatar({
  name,
  image,
  className,
}: {
  name: string;
  image?: string | null;
  className?: string;
}) {
  return (
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
}
