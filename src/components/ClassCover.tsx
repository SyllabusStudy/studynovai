import { COVERS, setCoverOverride, type CoverKey } from "@/lib/class-covers";
import { DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger } from "@/components/ui/dropdown-menu";

/** Background photo + strong dark gradient. Place inside a `relative overflow-hidden` card. */
export function ClassCoverBg({ src }: { src: string }) {
  return (
    <>
      <img src={src} alt="" loading="lazy" width={768} height={512} className="pointer-events-none absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background via-background/80 to-background/30" />
    </>
  );
}

export function ChangeCoverMenu({ classId }: { classId: string }) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>Change cover</DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuItem onClick={() => setCoverOverride(classId, null)}>Automatic</DropdownMenuItem>
        {(Object.keys(COVERS) as CoverKey[]).map((k) => (
          <DropdownMenuItem key={k} onClick={() => setCoverOverride(classId, k)}>{COVERS[k].label}</DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
