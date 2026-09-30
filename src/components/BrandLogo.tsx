import logo from "@/assets/studynova-logo.png.asset.json";
import { cn } from "@/lib/utils";

export function BrandLogo({ className }: { className?: string }) {
  return (
    <img
      src={logo.url}
      alt="SyllabusNova logo"
      width={36}
      height={36}
      className={cn("size-9 shrink-0 rounded-xl object-contain", className)}
    />
  );
}
