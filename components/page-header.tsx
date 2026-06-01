import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  accent?: string;
  children?: React.ReactNode;
}

export function PageHeader({
  title,
  description,
  icon,
  accent = "from-blue-500 to-violet-600",
  children,
}: PageHeaderProps) {
  return (
    <div className="relative mb-7 sm:mb-9 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start sm:items-center gap-4">
          {icon && (
            <div className="relative shrink-0">
              <div
                className={cn(
                  "h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-gradient-to-br flex items-center justify-center text-white shadow-lg ring-1 ring-white/10",
                  accent
                )}
              >
                {icon}
              </div>
              <div
                className={cn(
                  "absolute -inset-2 rounded-3xl bg-gradient-to-br opacity-15 blur-xl -z-10",
                  accent
                )}
              />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white leading-tight">
              {title}
            </h1>
            {description && (
              <p className="text-sm sm:text-[15px] text-slate-400 mt-1.5 max-w-2xl leading-relaxed">
                {description}
              </p>
            )}
          </div>
        </div>
        {children && (
          <div className="flex items-center gap-2 flex-wrap shrink-0">{children}</div>
        )}
      </div>
    </div>
  );
}
