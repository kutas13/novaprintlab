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
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
      <div className="flex items-center gap-4">
        {icon && (
          <div
            className={cn(
              "h-12 w-12 rounded-xl bg-gradient-to-br flex items-center justify-center text-white shadow-lg",
              accent
            )}
          >
            {icon}
          </div>
        )}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{title}</h1>
          {description && (
            <p className="text-sm text-slate-400 mt-1">{description}</p>
          )}
        </div>
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}
